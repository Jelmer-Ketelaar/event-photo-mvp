import { DurableObject } from "cloudflare:workers";
import { Hono } from "hono";
import { cors } from "hono/cors";
import {
  createEventSchema,
  createGuestSessionSchema,
  FILTER_PRESETS,
  toggleUploadsSchema,
  type EventAdmin,
  type EventPublic,
  type PhotoRecord
} from "@event-photo/shared";

type Env = {
  Bindings: {
    DB: D1Database;
    EVENT_MEDIA: R2Bucket;
    EVENT_ROOM: DurableObjectNamespace<EventRoom>;
    PUBLIC_APP_URL?: string;
    EVENT_RETENTION_DAYS?: string;
    MAX_UPLOAD_BYTES?: string;
  };
};

type EventRow = {
  id: string;
  name: string;
  date: string;
  description: string | null;
  guest_token: string;
  guest_token_hash: string;
  admin_token_hash: string;
  uploads_enabled: number;
  created_at: string;
  ended_at: string | null;
  expires_at: string;
};

type SessionRow = {
  id: string;
  event_id: string;
  nickname: string | null;
  session_token_hash: string;
  created_at: string;
  last_seen_at: string;
};

type PhotoRow = {
  id: string;
  event_id: string;
  uploader_session_id: string | null;
  uploader_nickname_snapshot: string | null;
  filter_name: string;
  object_key: string;
  width: number | null;
  height: number | null;
  bytes: number;
  mime_type: string;
  created_at: string;
  deleted_at: string | null;
};

const app = new Hono<Env>();

app.use(
  "/api/*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"]
  })
);

app.get("/api/health", (c) => c.json({ ok: true }));

app.post("/api/events", async (c) => {
  const body = await c.req.json();
  const parsed = createEventSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400);
  }

  const eventId = crypto.randomUUID();
  const guestToken = createToken();
  const adminToken = createToken();
  const now = new Date();
  const retentionDays = Number(c.env.EVENT_RETENTION_DAYS ?? "30");
  const expiresAt = new Date(new Date(parsed.data.date).getTime() + retentionDays * 24 * 60 * 60 * 1000);

  await c.env.DB.prepare(
    `INSERT INTO events (id, name, date, description, guest_token, guest_token_hash, admin_token_hash, uploads_enabled, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
  )
    .bind(
      eventId,
      parsed.data.name,
      parsed.data.date,
      normalizeOptionalText(parsed.data.description),
      guestToken,
      await sha256Hex(guestToken),
      await sha256Hex(adminToken),
      now.toISOString(),
      expiresAt.toISOString()
    )
    .run();

  const response = eventRowToAdmin(
    {
      id: eventId,
      name: parsed.data.name,
      date: parsed.data.date,
      description: normalizeOptionalText(parsed.data.description),
      uploads_enabled: 1,
      ended_at: null,
      expires_at: expiresAt.toISOString()
    },
    guestToken,
    adminToken,
    getPublicAppUrl(c.req.raw, c.env.PUBLIC_APP_URL)
  );

  return c.json(response, 201);
});

app.get("/api/events/:guestToken", async (c) => {
  const event = await getEventByGuestToken(c.env.DB, c.req.param("guestToken"));

  if (!event) {
    return c.json({ error: "Event not found." }, 404);
  }

  return c.json(eventRowToPublic(event));
});

app.post("/api/events/:guestToken/sessions", async (c) => {
  const event = await getEventByGuestToken(c.env.DB, c.req.param("guestToken"));

  if (!event) {
    return c.json({ error: "Event not found." }, 404);
  }

  const body = await c.req.json();
  const parsed = createGuestSessionSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400);
  }

  const now = new Date().toISOString();
  const sessionId = crypto.randomUUID();
  const sessionToken = createToken();

  await c.env.DB.prepare(
    `INSERT INTO guest_sessions (id, event_id, nickname, session_token_hash, created_at, last_seen_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  )
    .bind(
      sessionId,
      event.id,
      normalizeOptionalText(parsed.data.nickname),
      await sha256Hex(sessionToken),
      now,
      now
    )
    .run();

  return c.json({
    sessionToken,
    nickname: normalizeOptionalText(parsed.data.nickname)
  });
});

app.get("/api/events/:guestToken/photos", async (c) => {
  const event = await getEventByGuestToken(c.env.DB, c.req.param("guestToken"));

  if (!event) {
    return c.json({ error: "Event not found." }, 404);
  }

  const photos = await listPhotos(c.env.DB, event.id, c.req.param("guestToken"), false);
  return c.json({ photos });
});

app.post("/api/events/:guestToken/photos", async (c) => {
  const event = await getEventByGuestToken(c.env.DB, c.req.param("guestToken"));

  if (!event) {
    return c.json({ error: "Event not found." }, 404);
  }

  if (!event.uploads_enabled) {
    return c.json({ error: "Uploads are disabled for this event." }, 403);
  }

  const session = await requireGuestSession(c.req.header("Authorization"), c.env.DB, event.id);

  if (!session) {
    return c.json({ error: "A valid guest session is required." }, 401);
  }

  const form = await c.req.formData();
  const file = form.get("file");
  const filterName = String(form.get("filterName") ?? "original");
  const width = parseNullableInt(form.get("width"));
  const height = parseNullableInt(form.get("height"));

  if (!(file instanceof File)) {
    return c.json({ error: "An image file is required." }, 400);
  }

  if (!FILTER_PRESETS.some((preset) => preset.id === filterName)) {
    return c.json({ error: "Unsupported filter." }, 400);
  }

  const maxUploadBytes = Number(c.env.MAX_UPLOAD_BYTES ?? `${5 * 1024 * 1024}`);
  if (file.size > maxUploadBytes) {
    return c.json({ error: "File exceeds the upload limit." }, 413);
  }

  if (!file.type.startsWith("image/")) {
    return c.json({ error: "Only image uploads are supported." }, 400);
  }

  const photoId = crypto.randomUUID();
  const objectKey = `events/${event.id}/photos/${photoId}.jpg`;

  await c.env.EVENT_MEDIA.put(objectKey, await file.arrayBuffer(), {
    httpMetadata: {
      contentType: file.type
    }
  });

  const createdAt = new Date().toISOString();

  await c.env.DB.prepare(
    `INSERT INTO photos (id, event_id, uploader_session_id, uploader_nickname_snapshot, filter_name, object_key, width, height, bytes, mime_type, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      photoId,
      event.id,
      session.id,
      session.nickname,
      filterName,
      objectKey,
      width,
      height,
      file.size,
      file.type,
      createdAt
    )
    .run();

  await touchSession(c.env.DB, session.id);
  await broadcastEventUpdate(c.env.EVENT_ROOM, event.id, {
    type: "photo_created",
    photoId
  });

  return c.json({ ok: true, photoId }, 201);
});

app.get("/api/events/:guestToken/photos/:photoId/file", async (c) => {
  const event = await getEventByGuestToken(c.env.DB, c.req.param("guestToken"));

  if (!event) {
    return c.text("Not found", 404);
  }

  const photo = await getPhotoById(c.env.DB, c.req.param("photoId"), event.id);
  if (!photo || photo.deleted_at) {
    return c.text("Not found", 404);
  }

  return streamPhoto(c.env.EVENT_MEDIA, photo);
});

app.get("/api/events/:guestToken/socket", async (c) => {
  const event = await getEventByGuestToken(c.env.DB, c.req.param("guestToken"));

  if (!event) {
    return c.text("Not found", 404);
  }

  return connectToEventRoom(c.req.raw, c.env.EVENT_ROOM, event.id);
});

app.get("/api/admin/:adminToken", async (c) => {
  const event = await getEventByAdminToken(c.env.DB, c.req.param("adminToken"));

  if (!event) {
    return c.json({ error: "Event not found." }, 404);
  }

  return c.json(
    eventRowToAdmin(
      event,
      event.guest_token,
      c.req.param("adminToken"),
      getPublicAppUrl(c.req.raw, c.env.PUBLIC_APP_URL)
    )
  );
});

app.get("/api/admin/:adminToken/photos", async (c) => {
  const event = await getEventByAdminToken(c.env.DB, c.req.param("adminToken"));

  if (!event) {
    return c.json({ error: "Event not found." }, 404);
  }

  const photos = await listPhotos(c.env.DB, event.id, c.req.param("adminToken"), true);
  return c.json({ photos });
});

app.post("/api/admin/:adminToken/uploads", async (c) => {
  const event = await getEventByAdminToken(c.env.DB, c.req.param("adminToken"));
  if (!event) {
    return c.json({ error: "Event not found." }, 404);
  }

  if (event.ended_at) {
    return c.json({ error: "This event has been closed and can no longer accept uploads." }, 409);
  }

  const body = await c.req.json();
  const parsed = toggleUploadsSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400);
  }

  await c.env.DB.prepare("UPDATE events SET uploads_enabled = ? WHERE id = ?")
    .bind(parsed.data.enabled ? 1 : 0, event.id)
    .run();

  await broadcastEventUpdate(c.env.EVENT_ROOM, event.id, {
    type: "uploads_toggled",
    enabled: parsed.data.enabled
  });

  return c.json({ ok: true });
});

app.post("/api/admin/:adminToken/close", async (c) => {
  const event = await getEventByAdminToken(c.env.DB, c.req.param("adminToken"));
  if (!event) {
    return c.json({ error: "Event not found." }, 404);
  }

  const endedAt = new Date().toISOString();

  await c.env.DB.prepare("UPDATE events SET uploads_enabled = 0, ended_at = ? WHERE id = ?")
    .bind(endedAt, event.id)
    .run();

  await broadcastEventUpdate(c.env.EVENT_ROOM, event.id, {
    type: "event_closed",
    endedAt
  });

  return c.json({ ok: true, endedAt });
});

app.delete("/api/admin/:adminToken/photos/:photoId", async (c) => {
  const event = await getEventByAdminToken(c.env.DB, c.req.param("adminToken"));
  if (!event) {
    return c.json({ error: "Event not found." }, 404);
  }

  const photo = await getPhotoById(c.env.DB, c.req.param("photoId"), event.id);
  if (!photo || photo.deleted_at) {
    return c.json({ error: "Photo not found." }, 404);
  }

  await c.env.DB.prepare("UPDATE photos SET deleted_at = ? WHERE id = ?")
    .bind(new Date().toISOString(), photo.id)
    .run();

  await c.env.EVENT_MEDIA.delete(photo.object_key);
  await broadcastEventUpdate(c.env.EVENT_ROOM, event.id, {
    type: "photo_deleted",
    photoId: photo.id
  });

  return c.json({ ok: true });
});

app.get("/api/admin/:adminToken/photos/:photoId/file", async (c) => {
  const event = await getEventByAdminToken(c.env.DB, c.req.param("adminToken"));

  if (!event) {
    return c.text("Not found", 404);
  }

  const photo = await getPhotoById(c.env.DB, c.req.param("photoId"), event.id);
  if (!photo || photo.deleted_at) {
    return c.text("Not found", 404);
  }

  return streamPhoto(c.env.EVENT_MEDIA, photo);
});

app.get("/api/admin/:adminToken/socket", async (c) => {
  const event = await getEventByAdminToken(c.env.DB, c.req.param("adminToken"));

  if (!event) {
    return c.text("Not found", 404);
  }

  return connectToEventRoom(c.req.raw, c.env.EVENT_ROOM, event.id);
});

export default {
  fetch: app.fetch,
  scheduled: async (_controller: ScheduledController, env: Env["Bindings"]) => {
    const expiredEvents = await env.DB.prepare(
      "SELECT id FROM events WHERE expires_at < ?"
    )
      .bind(new Date().toISOString())
      .all<{ id: string }>();

    for (const event of expiredEvents.results ?? []) {
      const photos = await env.DB.prepare(
        "SELECT object_key FROM photos WHERE event_id = ?"
      )
        .bind(event.id)
        .all<{ object_key: string }>();

      for (const photo of photos.results ?? []) {
        await env.EVENT_MEDIA.delete(photo.object_key);
      }

      await env.DB.prepare("DELETE FROM photos WHERE event_id = ?").bind(event.id).run();
      await env.DB.prepare("DELETE FROM guest_sessions WHERE event_id = ?").bind(event.id).run();
      await env.DB.prepare("DELETE FROM events WHERE id = ?").bind(event.id).run();
    }
  }
};

export class EventRoom extends DurableObject {
  constructor(ctx: DurableObjectState, env: Env["Bindings"]) {
    super(ctx, env);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.headers.get("Upgrade") === "websocket") {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      this.ctx.acceptWebSocket(server);

      server.send(JSON.stringify({ type: "connected" }));

      return new Response(null, {
        status: 101,
        webSocket: client
      });
    }

    if (request.method === "POST" && url.pathname.endsWith("/broadcast")) {
      const payload = JSON.stringify(await request.json());
      for (const socket of this.ctx.getWebSockets()) {
        try {
          socket.send(payload);
        } catch {
          socket.close(1011, "broadcast failed");
        }
      }

      return new Response("ok");
    }

    return new Response("Not found", { status: 404 });
  }
}

async function getEventByGuestToken(db: D1Database, token: string) {
  return getEventByTokenColumn(db, "guest_token_hash", token);
}

async function getEventByAdminToken(db: D1Database, token: string) {
  return getEventByTokenColumn(db, "admin_token_hash", token);
}

async function getEventByTokenColumn(
  db: D1Database,
  tokenColumn: "guest_token_hash" | "admin_token_hash",
  token: string
) {
  const result = await db
    .prepare(`SELECT * FROM events WHERE ${tokenColumn} = ?`)
    .bind(await sha256Hex(token))
    .first<EventRow>();

  return result ?? null;
}

async function requireGuestSession(
  authorizationHeader: string | undefined,
  db: D1Database,
  eventId: string
) {
  const sessionToken = authorizationHeader?.replace(/^Bearer\s+/i, "").trim();
  if (!sessionToken) {
    return null;
  }

  const session = await db
    .prepare("SELECT * FROM guest_sessions WHERE session_token_hash = ? AND event_id = ?")
    .bind(await sha256Hex(sessionToken), eventId)
    .first<SessionRow>();

  return session ?? null;
}

async function touchSession(db: D1Database, sessionId: string) {
  await db.prepare("UPDATE guest_sessions SET last_seen_at = ? WHERE id = ?")
    .bind(new Date().toISOString(), sessionId)
    .run();
}

async function listPhotos(
  db: D1Database,
  eventId: string,
  accessToken: string,
  isAdmin: boolean
) {
  const query = "SELECT * FROM photos WHERE event_id = ? AND deleted_at IS NULL ORDER BY created_at DESC";

  const results = await db.prepare(query).bind(eventId).all<PhotoRow>();

  return (results.results ?? []).map((photo) => photoRowToApi(photo, accessToken, isAdmin));
}

async function getPhotoById(db: D1Database, photoId: string, eventId: string) {
  const result = await db
    .prepare("SELECT * FROM photos WHERE id = ? AND event_id = ?")
    .bind(photoId, eventId)
    .first<PhotoRow>();

  return result ?? null;
}

function photoRowToApi(photo: PhotoRow, accessToken: string, isAdmin: boolean): PhotoRecord {
  const basePath = isAdmin
    ? `/api/admin/${accessToken}/photos/${photo.id}/file`
    : `/api/events/${accessToken}/photos/${photo.id}/file`;

  return {
    id: photo.id,
    eventId: photo.event_id,
    uploaderNickname: photo.uploader_nickname_snapshot,
    filterName: photo.filter_name,
    createdAt: photo.created_at,
    width: photo.width,
    height: photo.height,
    bytes: photo.bytes,
    imageUrl: basePath
  };
}

function eventRowToPublic(event: EventRow): EventPublic {
  return {
    id: event.id,
    name: event.name,
    date: event.date,
    description: event.description,
    uploadsEnabled: Boolean(event.uploads_enabled),
    endedAt: event.ended_at,
    expiresAt: event.expires_at
  };
}

function eventRowToAdmin(
  event: Pick<EventRow, "id" | "name" | "date" | "description" | "uploads_enabled" | "ended_at" | "expires_at">,
  guestToken: string,
  adminToken: string,
  publicAppUrl: string
): EventAdmin {
  const publicEvent: EventPublic = {
    id: event.id,
    name: event.name,
    date: event.date,
    description: event.description,
    uploadsEnabled: Boolean(event.uploads_enabled),
    endedAt: event.ended_at,
    expiresAt: event.expires_at
  };

  return {
    ...publicEvent,
    guestInviteUrl: `${publicAppUrl}/join/${guestToken}`,
    adminUrl: `${publicAppUrl}/admin/${adminToken}`
  };
}

function getPublicAppUrl(request: Request, configuredUrl?: string) {
  if (configuredUrl) {
    return configuredUrl.replace(/\/$/, "");
  }

  const originHeader = request.headers.get("origin");
  if (originHeader) {
    return originHeader.replace(/\/$/, "");
  }

  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

function createToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return toBase64Url(bytes);
}

async function sha256Hex(input: string) {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function toBase64Url(bytes: Uint8Array) {
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function normalizeOptionalText(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function parseNullableInt(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

async function streamPhoto(bucket: R2Bucket, photo: PhotoRow) {
  const object = await bucket.get(photo.object_key);
  if (!object) {
    return new Response("Not found", { status: 404 });
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "private, max-age=300");

  return new Response(object.body, {
    headers
  });
}

async function broadcastEventUpdate(
  namespace: DurableObjectNamespace<EventRoom>,
  eventId: string,
  payload: Record<string, unknown>
) {
  const id = namespace.idFromName(eventId);
  const stub = namespace.get(id);

  await stub.fetch("https://event-room/broadcast", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });
}

function connectToEventRoom(
  request: Request,
  namespace: DurableObjectNamespace<EventRoom>,
  eventId: string
) {
  const id = namespace.idFromName(eventId);
  const stub = namespace.get(id);
  return stub.fetch(request);
}
