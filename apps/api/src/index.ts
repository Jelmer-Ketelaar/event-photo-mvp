import { DurableObject } from "cloudflare:workers";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import {
  createEventSchema,
  createGuestSessionSchema,
  FILTER_PRESETS,
  toggleUploadsSchema,
  type EventAdmin,
  type EventPublic,
  type PhotoRecord,
  type PublicConfig
} from "@event-photo/shared";

type Env = {
  Bindings: {
    DB: D1Database;
    EVENT_MEDIA: R2Bucket;
    EVENT_ROOM: DurableObjectNamespace<EventRoom>;
    SECURITY_GATE: DurableObjectNamespace<SecurityGate>;
    ASSETS?: Fetcher;
    PUBLIC_APP_URL?: string;
    ALLOWED_ORIGINS?: string;
    EVENT_RETENTION_DAYS?: string;
    MAX_UPLOAD_BYTES?: string;
    TOKEN_SIGNING_SECRET?: string;
    TURNSTILE_SITE_KEY?: string;
    TURNSTILE_SECRET_KEY?: string;
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

type TurnstileResponse = {
  success: boolean;
  action?: string;
  hostname?: string;
  "error-codes"?: string[];
};

type RateLimitRule = {
  limit: number;
  windowMs: number;
};

/** Time constants for readability */
const TIME = {
  MINUTE_MS: 60 * 1_000,
  HOUR_MS: 60 * 60 * 1_000,
  DAY_MS: 24 * 60 * 60 * 1_000
} as const;

/** Default configuration values */
const DEFAULTS = {
  EVENT_RETENTION_DAYS: 30,
  MAX_UPLOAD_BYTES: 5 * 1024 * 1024,
  CACHE_CONTROL_PHOTO: "private, max-age=300"
} as const;

/** Rate limiting configuration */
const RATE_LIMITS = {
  createEvent: {
    limit: 8,
    windowMs: 10 * TIME.MINUTE_MS
  },
  joinEvent: {
    limit: 20,
    windowMs: 10 * TIME.MINUTE_MS
  },
  uploadPhoto: {
    limit: 120,
    windowMs: 10 * TIME.MINUTE_MS
  }
} satisfies Record<string, RateLimitRule>;

const app = new Hono<Env>();

app.onError((error, c) => {
  console.error(error);
  return c.json({ error: "Internal server error." }, 500);
});

app.use("*", async (c, next) => {
  await next();
  applySecurityHeaders(c.res.headers, c.req.raw, c.env.PUBLIC_APP_URL);
});

app.use(
  "/api/*",
  cors({
    origin: (origin, c) => resolveCorsOrigin(origin, c.req.raw, c.env.PUBLIC_APP_URL, c.env.ALLOWED_ORIGINS),
    allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    maxAge: 86_400
  })
);

app.get("/api/public-config", (c) => {
  const response: PublicConfig = {
    turnstileSiteKey: c.env.TURNSTILE_SITE_KEY ?? null
  };

  return c.json(response);
});

app.get("/api/health", (c) => c.json({ ok: true }));

app.post("/api/events", async (c) => {
  await enforceRateLimit(c.env.SECURITY_GATE, buildRateLimitKey(c.req.raw, "create-event"), RATE_LIMITS.createEvent);

  const body = await c.req.json();
  const parsed = createEventSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400);
  }

  const tokenSigningSecret = requireTokenSigningSecret(c.env.TOKEN_SIGNING_SECRET);
  await enforceTurnstile({
    expectedAction: "create-event",
    request: c.req.raw,
    secretKey: c.env.TURNSTILE_SECRET_KEY,
    siteKey: c.env.TURNSTILE_SITE_KEY,
    token: parsed.data.turnstileToken
  });

  const eventId = crypto.randomUUID();
  const guestToken = await createSignedGuestToken(eventId, tokenSigningSecret);
  const adminToken = createToken();
  const now = new Date();
  const retentionDays = Number(c.env.EVENT_RETENTION_DAYS ?? DEFAULTS.EVENT_RETENTION_DAYS);
  const expiresAt = new Date(new Date(parsed.data.date).getTime() + retentionDays * TIME.DAY_MS);
  const guestTokenHash = await sha256Hex(guestToken);

  await c.env.DB.prepare(
    `INSERT INTO events (id, name, date, description, guest_token, guest_token_hash, admin_token_hash, uploads_enabled, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
  )
    .bind(
      eventId,
      parsed.data.name,
      parsed.data.date,
      normalizeOptionalText(parsed.data.description),
      guestTokenHash,
      guestTokenHash,
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
  const event = await getEventByGuestToken(c.env.DB, c.req.param("guestToken"), c.env.TOKEN_SIGNING_SECRET);

  if (!event) {
    return c.json({ error: "Event not found." }, 404);
  }

  return c.json(eventRowToPublic(event));
});

app.post("/api/events/:guestToken/sessions", async (c) => {
  await enforceRateLimit(
    c.env.SECURITY_GATE,
    buildRateLimitKey(c.req.raw, `join-event:${c.req.param("guestToken")}`),
    RATE_LIMITS.joinEvent
  );

  const event = await getEventByGuestToken(c.env.DB, c.req.param("guestToken"), c.env.TOKEN_SIGNING_SECRET);

  if (!event) {
    return c.json({ error: "Event not found." }, 404);
  }

  const body = await c.req.json();
  const parsed = createGuestSessionSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400);
  }

  await enforceTurnstile({
    expectedAction: "join-event",
    request: c.req.raw,
    secretKey: c.env.TURNSTILE_SECRET_KEY,
    siteKey: c.env.TURNSTILE_SITE_KEY,
    token: parsed.data.turnstileToken
  });

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
  const event = await getEventByGuestToken(c.env.DB, c.req.param("guestToken"), c.env.TOKEN_SIGNING_SECRET);

  if (!event) {
    return c.json({ error: "Event not found." }, 404);
  }

  const photos = await listPhotos(c.env.DB, event.id, c.req.param("guestToken"), false);
  return c.json({ photos });
});

app.post("/api/events/:guestToken/photos", async (c) => {
  const event = await getEventByGuestToken(c.env.DB, c.req.param("guestToken"), c.env.TOKEN_SIGNING_SECRET);

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

  await enforceRateLimit(
    c.env.SECURITY_GATE,
    `upload:${event.id}:${session.id}`,
    RATE_LIMITS.uploadPhoto
  );

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

  const maxUploadBytes = Number(c.env.MAX_UPLOAD_BYTES ?? DEFAULTS.MAX_UPLOAD_BYTES);
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
  const event = await getEventByGuestToken(c.env.DB, c.req.param("guestToken"), c.env.TOKEN_SIGNING_SECRET);

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
  const event = await getEventByGuestToken(c.env.DB, c.req.param("guestToken"), c.env.TOKEN_SIGNING_SECRET);

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
      await createSignedGuestToken(event.id, requireTokenSigningSecret(c.env.TOKEN_SIGNING_SECRET)),
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

app.notFound(async (c) => {
  if (!c.env.ASSETS || !["GET", "HEAD"].includes(c.req.method)) {
    return c.text("Not found", 404);
  }

  const assetResponse = await c.env.ASSETS.fetch(c.req.raw);
  return assetResponse.status === 404 ? c.text("Not found", 404) : assetResponse;
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

export class SecurityGate extends DurableObject {
  constructor(ctx: DurableObjectState, env: Env["Bindings"]) {
    super(ctx, env);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method !== "POST" || !url.pathname.endsWith("/limit")) {
      return new Response("Not found", { status: 404 });
    }

    const { limit, windowMs } = (await request.json()) as RateLimitRule;
    const now = Date.now();

    const result = await this.ctx.blockConcurrencyWhile(async () => {
      const current = await this.ctx.storage.get<{ count: number; resetAt: number }>("state");

      if (!current || current.resetAt <= now) {
        const nextState = {
          count: 1,
          resetAt: now + windowMs
        };

        await this.ctx.storage.put("state", nextState);
        return { allowed: true, retryAfterSeconds: Math.ceil(windowMs / 1_000) };
      }

      if (current.count >= limit) {
        return {
          allowed: false,
          retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1_000))
        };
      }

      await this.ctx.storage.put("state", {
        count: current.count + 1,
        resetAt: current.resetAt
      });

      return {
        allowed: true,
        retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1_000))
      };
    });

    return Response.json(result);
  }
}

async function getEventByGuestToken(db: D1Database, token: string, tokenSigningSecret?: string) {
  const signedEventId = await getEventIdFromSignedGuestToken(token, tokenSigningSecret);
  if (signedEventId) {
    const event = await db.prepare("SELECT * FROM events WHERE id = ?").bind(signedEventId).first<EventRow>();
    if (event) {
      return event;
    }
  }

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
  const normalizedConfiguredUrl = configuredUrl?.replace(/\/$/, "");
  const originHeader = request.headers.get("origin")?.replace(/\/$/, "");

  if (originHeader && (!normalizedConfiguredUrl || isLoopbackUrl(normalizedConfiguredUrl))) {
    return originHeader;
  }

  if (normalizedConfiguredUrl) {
    return normalizedConfiguredUrl;
  }

  if (originHeader) {
    return originHeader;
  }

  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

function isLoopbackUrl(urlString: string) {
  try {
    const url = new URL(urlString);
    return ["localhost", "127.0.0.1", "0.0.0.0"].includes(url.hostname);
  } catch {
    return false;
  }
}

function createToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return toBase64Url(bytes);
}

async function createSignedGuestToken(eventId: string, secret: string) {
  const signature = await hmacSha256Base64Url(secret, `guest:${eventId}`);
  return `${eventId}.${signature}`;
}

async function getEventIdFromSignedGuestToken(token: string, tokenSigningSecret?: string) {
  const [eventId, providedSignature] = token.split(".");

  if (!eventId || !providedSignature || !/^[0-9a-f-]{36}$/i.test(eventId)) {
    return null;
  }

  const secret = requireTokenSigningSecret(tokenSigningSecret);
  const expectedSignature = await hmacSha256Base64Url(secret, `guest:${eventId}`);
  return providedSignature === expectedSignature ? eventId : null;
}

function requireTokenSigningSecret(secret?: string) {
  const resolvedSecret = secret?.trim();
  if (!resolvedSecret) {
    throw new Error("TOKEN_SIGNING_SECRET is not configured.");
  }

  return resolvedSecret;
}

async function sha256Hex(input: string) {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hmacSha256Base64Url(secret: string, input: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(input));
  return toBase64Url(new Uint8Array(signature));
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
  headers.set("cache-control", DEFAULTS.CACHE_CONTROL_PHOTO);

  return new Response(object.body, {
    headers
  });
}

async function enforceRateLimit(
  namespace: DurableObjectNamespace<SecurityGate>,
  scopeKey: string,
  rule: RateLimitRule
) {
  const stub = namespace.get(namespace.idFromName(scopeKey));
  const response = await stub.fetch("https://security-gate/limit", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(rule)
  });
  const result = (await response.json()) as { allowed: boolean; retryAfterSeconds: number };

  if (!result.allowed) {
    throw new HTTPException(429, {
      message: "Too many requests. Please wait and try again.",
      res: new Response(JSON.stringify({ error: "Too many requests. Please wait and try again." }), {
        status: 429,
        headers: {
          "content-type": "application/json",
          "retry-after": String(result.retryAfterSeconds)
        }
      })
    });
  }
}

function buildRateLimitKey(request: Request, scope: string) {
  const ip = getClientIp(request) ?? "unknown";
  return `${scope}:${ip}`;
}

function getClientIp(request: Request) {
  return request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

async function enforceTurnstile(input: {
  token: string | undefined;
  request: Request;
  siteKey?: string;
  secretKey?: string;
  expectedAction: string;
}) {
  const secretKey = input.secretKey?.trim();
  const siteKey = input.siteKey?.trim();

  if (!secretKey || !siteKey) {
    return;
  }

  const token = input.token?.trim();
  if (!token) {
    throw new HTTPException(400, {
      res: Response.json({ error: "Complete the human verification first." }, { status: 400 })
    });
  }

  const payload = new URLSearchParams({
    secret: secretKey,
    response: token,
    idempotency_key: crypto.randomUUID()
  });

  const clientIp = getClientIp(input.request);
  if (clientIp) {
    payload.set("remoteip", clientIp);
  }

  const verificationResponse = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded"
    },
    body: payload
  });

  const verification = (await verificationResponse.json()) as TurnstileResponse;
  if (!verificationResponse.ok || !verification.success) {
    throw new HTTPException(400, {
      res: Response.json({ error: "Human verification failed. Try again." }, { status: 400 })
    });
  }

  if (verification.action && verification.action !== input.expectedAction) {
    throw new HTTPException(400, {
      res: Response.json({ error: "Human verification failed. Try again." }, { status: 400 })
    });
  }

  const expectedHostname = getExpectedHostname(input.request);
  if (expectedHostname && verification.hostname && verification.hostname !== expectedHostname) {
    throw new HTTPException(400, {
      res: Response.json({ error: "Human verification failed. Try again." }, { status: 400 })
    });
  }
}

function resolveCorsOrigin(
  origin: string,
  request: Request,
  configuredAppUrl?: string,
  configuredAllowedOrigins?: string
) {
  if (!origin) {
    return null;
  }

  const normalizedOrigin = origin.replace(/\/$/, "");
  const allowedOrigins = new Set(
    [configuredAppUrl, ...splitConfiguredOrigins(configuredAllowedOrigins)]
      .filter(Boolean)
      .map((value) => value!.replace(/\/$/, ""))
  );

  allowedOrigins.add("capacitor://localhost");
  allowedOrigins.add("ionic://localhost");
  allowedOrigins.add("http://localhost");
  allowedOrigins.add("http://127.0.0.1");

  const requestUrl = new URL(request.url);
  if (normalizedOrigin === `${requestUrl.protocol}//${requestUrl.host}`) {
    return normalizedOrigin;
  }

  try {
    const originUrl = new URL(normalizedOrigin);
    if (originUrl.hostname === requestUrl.hostname && isDevelopmentHostname(originUrl.hostname)) {
      return normalizedOrigin;
    }
  } catch {
    return null;
  }

  return allowedOrigins.has(normalizedOrigin) ? normalizedOrigin : null;
}

function splitConfiguredOrigins(configuredAllowedOrigins?: string) {
  return (configuredAllowedOrigins ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function applySecurityHeaders(headers: Headers, request: Request, configuredAppUrl?: string) {
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Permissions-Policy", "camera=(self), microphone=(), geolocation=(), interest-cohort=()");

  const requestUrl = new URL(request.url);
  if (requestUrl.protocol === "https:" && !isLoopbackHostname(requestUrl.hostname)) {
    headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }

  const contentType = headers.get("content-type") ?? "";
  if (contentType.includes("text/html")) {
    headers.set("Content-Security-Policy", buildContentSecurityPolicy(request, configuredAppUrl));
  }
}

function buildContentSecurityPolicy(request: Request, configuredAppUrl?: string) {
  const requestUrl = new URL(request.url);
  const connectSources = new Set<string>(["'self'", "https://challenges.cloudflare.com"]);
  connectSources.add(requestUrl.protocol === "https:" ? `wss://${requestUrl.host}` : `ws://${requestUrl.host}`);

  if (isDevelopmentHostname(requestUrl.hostname)) {
    connectSources.add("ws:");
    connectSources.add("http:");
  }

  if (configuredAppUrl) {
    try {
      const configuredUrl = new URL(configuredAppUrl);
      connectSources.add(`${configuredUrl.protocol}//${configuredUrl.host}`);
      connectSources.add(configuredUrl.protocol === "https:" ? `wss://${configuredUrl.host}` : `ws://${configuredUrl.host}`);
    } catch {
      // Ignore invalid configured URL and fall back to self.
    }
  }

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    `script-src 'self' https://challenges.cloudflare.com`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob:",
    `connect-src ${[...connectSources].join(" ")}`,
    "frame-src https://challenges.cloudflare.com",
    "worker-src 'self' blob:"
  ].join("; ");
}

function getExpectedHostname(request: Request) {
  const url = new URL(request.url);
  return isDevelopmentHostname(url.hostname) ? null : url.hostname;
}

function isLoopbackHostname(hostname: string) {
  return ["localhost", "127.0.0.1", "0.0.0.0"].includes(hostname);
}

function isDevelopmentHostname(hostname: string) {
  return isLoopbackHostname(hostname) || isPrivateIpAddress(hostname);
}

function isPrivateIpAddress(hostname: string) {
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) || /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
    return true;
  }

  const match = hostname.match(/^172\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/);
  if (!match) {
    return false;
  }

  const secondOctet = Number(match[1]);
  return secondOctet >= 16 && secondOctet <= 31;
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
