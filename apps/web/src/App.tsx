import { useEffect, useMemo, useState } from "react";
import { Routes, Route, useNavigate, useParams, Link } from "react-router-dom";
import type { CreateEventInput, EventAdmin, EventPublic, PhotoRecord } from "@event-photo/shared";
import { AlbumGrid } from "./components/AlbumGrid";
import { DownloadGrid } from "./components/DownloadGrid";
import { SharePanel } from "./components/SharePanel";
import { UploadComposer } from "./components/UploadComposer";
import {
  closeAdminEvent,
  createEvent,
  createGuestSession,
  deleteAdminPhoto,
  fetchAdminEvent,
  fetchAdminPhotos,
  fetchGuestEvent,
  fetchGuestPhotos,
  getApiBaseUrl,
  toggleAdminUploads,
  toAbsoluteMediaUrl,
  uploadGuestPhoto
} from "./lib/api";
import { downloadPhotosAsZip, downloadPhotosIndividually } from "./lib/downloads";

export default function App() {
  return (
    <Routes>
      <Route element={<HomePage />} path="/" />
      <Route element={<EventSharePage />} path="/events/share/:adminToken" />
      <Route element={<GuestDownloadsPage />} path="/downloads/:guestToken" />
      <Route element={<GuestEventPage />} path="/join/:guestToken" />
      <Route element={<AdminEventPage />} path="/admin/:adminToken" />
    </Routes>
  );
}

function HomePage() {
  const navigate = useNavigate();
  const [form, setForm] = useState<CreateEventInput>({
    name: "",
    date: new Date().toISOString(),
    description: ""
  });
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setErrorMessage(null);

    try {
      const response = await createEvent(form);
      navigate(`/events/share/${extractAdminToken(response.adminUrl)}`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not create the event.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="page-shell">
      <section className="hero">
        <div className="hero-copy">
          <p className="section-eyebrow">GuestFrame</p>
          <h1>Private event albums with instant guest uploads and no participant cap.</h1>
          <p className="lede">
            Create an event, share the QR, let guests shoot with film-style filters, and collect every photo in one private album.
          </p>
          <div className="hero-pills">
            <span>Unlimited guests</span>
            <span>No guest accounts</span>
            <span>Private invite links</span>
          </div>
        </div>

        <div className="card create-card">
          <p className="section-eyebrow">Create Event</p>
          <form className="stack" onSubmit={handleSubmit}>
            <label>
              Event name
              <input
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="Friday Garden Party"
                required
                value={form.name}
              />
            </label>
            <label>
              Event date
              <input
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    date: new Date(event.target.value).toISOString()
                  }))
                }
                required
                type="datetime-local"
                value={toDateTimeLocal(form.date)}
              />
            </label>
            <label>
              Description
              <textarea
                onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                placeholder="Optional note for guests"
                rows={4}
                value={form.description ?? ""}
              />
            </label>
            <button disabled={isSaving} type="submit">
              {isSaving ? "Creating…" : "Create event"}
            </button>
            {errorMessage ? <div className="status-banner danger">{errorMessage}</div> : null}
          </form>
        </div>
      </section>

    </div>
  );
}

function EventSharePage() {
  const { adminToken = "" } = useParams();
  const [eventData, setEventData] = useState<EventAdmin | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    fetchAdminEvent(adminToken)
      .then(setEventData)
      .catch((error: Error) => setErrorMessage(error.message))
      .finally(() => setLoading(false));
  }, [adminToken]);

  if (loading) {
    return <LoadingState />;
  }

  if (errorMessage && !eventData) {
    return <ErrorState message={errorMessage} />;
  }

  if (!eventData) {
    return <ErrorState message="Event not found." />;
  }

  return (
    <div className="page-shell">
      <EventHeader
        date={eventData.date}
        description={eventData.description}
        eyebrow="Event created"
        title={eventData.name}
      />

      <section className="section-block success-panel">
        <div className="section-header">
          <div>
            <p className="section-eyebrow">Ready to Share</p>
            <h2>Your event is live. Send the guest link or let people scan the QR.</h2>
          </div>
          <div className="page-actions">
            <Link className="ghost-link" to={`/admin/${adminToken}`}>
              Open organizer dashboard
            </Link>
            <Link className="ghost-link" to="/">
              Create another event
            </Link>
          </div>
        </div>
      </section>

      <SharePanel adminUrl={eventData.adminUrl} guestInviteUrl={eventData.guestInviteUrl} />
    </div>
  );
}

function GuestEventPage() {
  const { guestToken = "" } = useParams();
  const storageKey = useMemo(() => `guestframe:guest-session:${guestToken}`, [guestToken]);
  const nicknameKey = useMemo(() => `guestframe:guest-nickname:${guestToken}`, [guestToken]);
  const [eventData, setEventData] = useState<EventPublic | null>(null);
  const [photos, setPhotos] = useState<PhotoRecord[]>([]);
  const [sessionToken, setSessionToken] = useState<string | null>(() => window.localStorage.getItem(storageKey));
  const [nickname, setNickname] = useState(() => window.localStorage.getItem(nicknameKey) ?? "");
  const [pendingNickname, setPendingNickname] = useState(() => window.localStorage.getItem(nicknameKey) ?? "");
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function refresh() {
    const [eventResponse, photoResponse] = await Promise.all([
      fetchGuestEvent(guestToken),
      fetchGuestPhotos(guestToken)
    ]);

    setEventData(eventResponse);
    setPhotos(photoResponse.photos);
  }

  useEffect(() => {
    refresh()
      .catch((error: Error) => setErrorMessage(error.message))
      .finally(() => setLoading(false));
  }, [guestToken]);

  useEffect(() => {
    if (!sessionToken) {
      return;
    }

    const socket = openEventSocket(`/api/events/${guestToken}/socket`, refresh);
    return () => socket?.close();
  }, [guestToken, sessionToken]);

  async function handleCreateSession(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      const session = await createGuestSession(guestToken, pendingNickname);
      setSessionToken(session.sessionToken);
      setNickname(session.nickname ?? "");
      window.localStorage.setItem(storageKey, session.sessionToken);
      window.localStorage.setItem(nicknameKey, session.nickname ?? "");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not join the event.");
    }
  }

  async function handleUpload(payload: {
    blob: Blob;
    fileName: string;
    filterName: string;
    width: number;
    height: number;
  }) {
    if (!sessionToken) {
      throw new Error("Join the event before uploading.");
    }

    await uploadGuestPhoto(guestToken, sessionToken, payload);
    await refresh();
  }

  if (loading) {
    return <LoadingState />;
  }

  if (errorMessage && !eventData) {
    return <ErrorState message={errorMessage} />;
  }

  if (!eventData) {
    return <ErrorState message="Event not found." />;
  }

  return (
    <div className="page-shell">
      <EventHeader
        date={eventData.date}
        description={eventData.description}
        eyebrow={nickname ? `Joined as ${nickname}` : "Guest access"}
        title={eventData.name}
      />

      {!sessionToken ? (
        <section className="card join-card">
          <p className="section-eyebrow">Join Event</p>
          <h2>Add a nickname if you want people to know which photos are yours.</h2>
          <form className="stack" onSubmit={handleCreateSession}>
            <label>
              Nickname
              <input onChange={(event) => setPendingNickname(event.target.value)} placeholder="Sam" value={pendingNickname} />
            </label>
            <button type="submit">Continue</button>
          </form>
        </section>
      ) : null}

      {eventData.endedAt ? (
        <div className="status-banner warning">This event has been closed. Guests can still view and download the album.</div>
      ) : null}

      <div className="page-actions flow-actions">
        <Link className="ghost-link" to={`/downloads/${guestToken}`}>
          Download photos
        </Link>
      </div>

      <UploadComposer
        canUpload={Boolean(sessionToken) && eventData.uploadsEnabled}
        joinRequired={!sessionToken}
        onUpload={handleUpload}
        uploadsPaused={Boolean(sessionToken) && !eventData.uploadsEnabled}
      />

      <section className="section-block">
        <div className="section-header">
          <div>
            <p className="section-eyebrow">Shared Album</p>
            <h2>Everyone’s photos land here automatically.</h2>
          </div>
        </div>
        <AlbumGrid mode="guest" photos={photos} />
      </section>
    </div>
  );
}

function GuestDownloadsPage() {
  const { guestToken = "" } = useParams();
  const [eventData, setEventData] = useState<EventPublic | null>(null);
  const [photos, setPhotos] = useState<PhotoRecord[]>([]);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const isMobileDevice = useMemo(() => detectMobileDevice(), []);

  async function refresh() {
    const [eventResponse, photoResponse] = await Promise.all([
      fetchGuestEvent(guestToken),
      fetchGuestPhotos(guestToken)
    ]);

    setEventData(eventResponse);
    setPhotos(photoResponse.photos);
    setSelectedPhotoIds((current) => current.filter((photoId) => photoResponse.photos.some((photo) => photo.id === photoId)));
  }

  useEffect(() => {
    refresh()
      .catch((error: Error) => setErrorMessage(error.message))
      .finally(() => setLoading(false));
  }, [guestToken]);

  useEffect(() => {
    const socket = openEventSocket(`/api/events/${guestToken}/socket`, refresh);
    return () => socket?.close();
  }, [guestToken]);

  const selectedPhotos = photos.filter((photo) => selectedPhotoIds.includes(photo.id));

  function toggleSelection(photoId: string) {
    setSelectedPhotoIds((current) =>
      current.includes(photoId) ? current.filter((id) => id !== photoId) : [...current, photoId]
    );
  }

  function selectAll() {
    setSelectedPhotoIds(photos.map((photo) => photo.id));
  }

  function clearSelection() {
    setSelectedPhotoIds([]);
  }

  async function handleDownloadSelected() {
    if (!eventData || selectedPhotos.length === 0) {
      return;
    }

    setIsDownloading(true);
    setErrorMessage(null);

    try {
      if (isMobileDevice) {
        await downloadPhotosIndividually(eventData.name, selectedPhotos);
      } else {
        await downloadPhotosAsZip(eventData.name, selectedPhotos, "selection");
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not download the selected photos.");
    } finally {
      setIsDownloading(false);
    }
  }

  async function handleDownloadAllZip() {
    if (!eventData || photos.length === 0) {
      return;
    }

    setIsDownloading(true);
    setErrorMessage(null);

    try {
      await downloadPhotosAsZip(eventData.name, photos, "album");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not create the ZIP file.");
    } finally {
      setIsDownloading(false);
    }
  }

  if (loading) {
    return <LoadingState />;
  }

  if (errorMessage && !eventData) {
    return <ErrorState message={errorMessage} />;
  }

  if (!eventData) {
    return <ErrorState message="Event not found." />;
  }

  return (
    <div className="page-shell">
      <EventHeader
        date={eventData.date}
        description={eventData.description}
        eyebrow="Guest downloads"
        title={eventData.name}
      />

      <section className="section-block">
        <div className="section-header">
          <div>
            <p className="section-eyebrow">Download Album</p>
            <h2>Select photos and take them with you.</h2>
            <p className="muted">
              {isMobileDevice
                ? "On mobile, selected photos download directly to your browser downloads."
                : "On desktop, selected photos are bundled into one ZIP file."}
            </p>
          </div>
          <div className="page-actions">
            <Link className="ghost-link" to={`/join/${guestToken}`}>
              Back to event
            </Link>
          </div>
        </div>

        {eventData.endedAt ? (
          <div className="status-banner warning">This event has been closed. The album stays available for viewing and downloads.</div>
        ) : null}

        <div className="download-toolbar">
          <div className="download-selection-meta">
            <strong>{selectedPhotoIds.length}</strong>
            <span>selected</span>
          </div>
          <div className="page-actions">
            <button className="ghost" disabled={photos.length === 0} onClick={selectAll} type="button">
              Select all
            </button>
            <button className="ghost" disabled={selectedPhotoIds.length === 0} onClick={clearSelection} type="button">
              Clear
            </button>
            <button
              disabled={selectedPhotos.length === 0 || isDownloading}
              onClick={handleDownloadSelected}
              type="button"
            >
              {isDownloading
                ? "Preparing…"
                : isMobileDevice
                  ? "Download selected"
                  : "Download selection ZIP"}
            </button>
            <button
              className="secondary"
              disabled={photos.length === 0 || isDownloading}
              onClick={handleDownloadAllZip}
              type="button"
            >
              Download full album ZIP
            </button>
          </div>
        </div>

        {errorMessage ? <div className="status-banner danger">{errorMessage}</div> : null}

        <DownloadGrid onToggle={toggleSelection} photos={photos} selectedPhotoIds={selectedPhotoIds} />
      </section>
    </div>
  );
}

function AdminEventPage() {
  const { adminToken = "" } = useParams();
  const [eventData, setEventData] = useState<EventAdmin | null>(null);
  const [photos, setPhotos] = useState<PhotoRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [deletingPhotoId, setDeletingPhotoId] = useState<string | null>(null);
  const [isClosingEvent, setIsClosingEvent] = useState(false);

  async function refresh() {
    const [eventResponse, photoResponse] = await Promise.all([
      fetchAdminEvent(adminToken),
      fetchAdminPhotos(adminToken)
    ]);

    setEventData(eventResponse);
    setPhotos(photoResponse.photos);
  }

  useEffect(() => {
    refresh()
      .catch((error: Error) => setErrorMessage(error.message))
      .finally(() => setLoading(false));
  }, [adminToken]);

  useEffect(() => {
    const socket = openEventSocket(`/api/admin/${adminToken}/socket`, refresh);
    return () => socket?.close();
  }, [adminToken]);

  async function handleToggleUploads() {
    if (!eventData) {
      return;
    }

    await toggleAdminUploads(adminToken, !eventData.uploadsEnabled);
    await refresh();
  }

  async function handleDelete(photoId: string) {
    const previousPhotos = photos;
    setDeletingPhotoId(photoId);
    setErrorMessage(null);
    setPhotos((current) => current.filter((photo) => photo.id !== photoId));

    try {
      await deleteAdminPhoto(adminToken, photoId);
      await refresh();
    } catch (error) {
      setPhotos(previousPhotos);
      setErrorMessage(error instanceof Error ? error.message : "Could not delete the photo.");
    } finally {
      setDeletingPhotoId(null);
    }
  }

  async function handleCloseEvent() {
    if (!eventData || eventData.endedAt) {
      return;
    }

    const confirmed = window.confirm("Close this event? Guests will still be able to view and download photos, but uploads will be disabled.");
    if (!confirmed) {
      return;
    }

    setIsClosingEvent(true);
    setErrorMessage(null);

    try {
      await closeAdminEvent(adminToken);
      await refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not close the event.");
    } finally {
      setIsClosingEvent(false);
    }
  }

  async function handleDownloadAll() {
    if (!eventData || photos.length === 0) {
      return;
    }

    setIsDownloading(true);
    try {
      await downloadPhotosAsZip(eventData.name, photos, "album");
    } finally {
      setIsDownloading(false);
    }
  }

  if (loading) {
    return <LoadingState />;
  }

  if (errorMessage && !eventData) {
    return <ErrorState message={errorMessage} />;
  }

  if (!eventData) {
    return <ErrorState message="Admin event not found." />;
  }

  return (
    <div className="page-shell">
      <EventHeader
        date={eventData.date}
        description={eventData.description}
        eyebrow="Organizer controls"
        title={eventData.name}
      />

      <div className="admin-toolbar">
        <button disabled={Boolean(eventData.endedAt)} onClick={handleToggleUploads} type="button">
          {eventData.uploadsEnabled ? "Pause uploads" : "Resume uploads"}
        </button>
        <button
          className="danger"
          disabled={Boolean(eventData.endedAt) || isClosingEvent}
          onClick={handleCloseEvent}
          type="button"
        >
          {eventData.endedAt ? "Event closed" : isClosingEvent ? "Closing event…" : "Close event"}
        </button>
        <button className="secondary" disabled={isDownloading || photos.length === 0} onClick={handleDownloadAll} type="button">
          {isDownloading ? "Preparing ZIP…" : "Download all"}
        </button>
      </div>

      {eventData.endedAt ? (
        <div className="status-banner warning">This event has been closed. Uploads are permanently disabled, but the album remains available.</div>
      ) : null}

      {errorMessage ? <div className="status-banner danger">{errorMessage}</div> : null}

      <SharePanel adminUrl={eventData.adminUrl} guestInviteUrl={eventData.guestInviteUrl} />

      <section className="section-block">
        <div className="section-header">
          <div>
            <p className="section-eyebrow">Admin Album</p>
            <h2>Moderate uploads and keep the whole set.</h2>
          </div>
        </div>
        <AlbumGrid deletingPhotoId={deletingPhotoId} mode="admin" onDelete={handleDelete} photos={photos} />
      </section>
    </div>
  );
}

function EventHeader(props: {
  eyebrow: string;
  title: string;
  date: string;
  description: string | null;
}) {
  return (
    <header className="event-header">
      <div>
        <p className="section-eyebrow">{props.eyebrow}</p>
        <h1>{props.title}</h1>
        <p className="lede narrow">{formatLongDate(props.date)}</p>
        {props.description ? <p className="muted">{props.description}</p> : null}
      </div>
      <Link className="ghost-link" to="/">
        Create another event
      </Link>
    </header>
  );
}

function LoadingState() {
  return (
    <div className="page-shell center-shell">
      <div className="empty-state">
        <p>Loading event…</p>
      </div>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="page-shell center-shell">
      <div className="empty-state danger">
        <p>{message}</p>
        <Link to="/">Back home</Link>
      </div>
    </div>
  );
}

function openEventSocket(path: string, onRefresh: () => Promise<void>) {
  const apiBaseUrl = getApiBaseUrl();
  const socketUrl = new URL(path, apiBaseUrl);
  socketUrl.protocol = socketUrl.protocol === "https:" ? "wss:" : "ws:";
  const socket = new WebSocket(socketUrl);

  socket.addEventListener("message", () => {
    onRefresh().catch(() => undefined);
  });

  return socket;
}

function toDateTimeLocal(value: string) {
  const date = new Date(value);
  const timezoneOffset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - timezoneOffset).toISOString().slice(0, 16);
}

function formatLongDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function sanitizeFileName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function detectMobileDevice() {
  if (typeof navigator === "undefined") {
    return false;
  }

  return /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent) || navigator.maxTouchPoints > 1;
}

function extractAdminToken(adminUrl: string) {
  const url = new URL(adminUrl);
  const token = url.pathname.split("/").filter(Boolean).at(-1);

  if (!token) {
    throw new Error("The event was created, but the admin link is invalid.");
  }

  return token;
}
