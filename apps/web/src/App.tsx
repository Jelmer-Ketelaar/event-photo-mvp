import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createEventSchema,
  createGuestSessionSchema,
  type CreateEventInput,
  type PhotoRecord
} from "@event-photo/shared";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { Link, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { z } from "zod";
import { AlbumGrid } from "./components/AlbumGrid";
import { DownloadGrid } from "./components/DownloadGrid";
import { SharePanel } from "./components/SharePanel";
import { UploadComposer } from "./components/UploadComposer";
import { useAdminAlbumQuery, useAdminEventQuery, useGuestAlbumQuery } from "./hooks/useEventQueries";
import { useEventSocketInvalidation } from "./hooks/useEventSocketInvalidation";
import {
  closeAdminEvent,
  createEvent,
  createGuestSession,
  deleteAdminPhoto,
  toggleAdminUploads,
  uploadGuestPhoto
} from "./lib/api";
import { downloadPhotosAsZip, downloadPhotosIndividually } from "./lib/downloads";
import { firstErrorMessage } from "./lib/errors";
import { detectMobileDevice, formatLongDateTime, toDateTimeLocal } from "./lib/format";
import { queryKeys } from "./lib/query";

const createEventFormSchema = z.object({
  name: createEventSchema.shape.name,
  dateLocal: z
    .string()
    .min(1, "Event date is required.")
    .refine((value) => !Number.isNaN(new Date(value).getTime()), "Use a valid date and time."),
  description: createEventSchema.shape.description
});

type CreateEventFormValues = z.infer<typeof createEventFormSchema>;
type GuestJoinFormValues = z.infer<typeof createGuestSessionSchema>;

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
  const createEventMutation = useMutation({
    mutationFn: createEvent,
    onSuccess: (response) => {
      navigate(`/events/share/${extractAdminToken(response.adminUrl)}`);
    }
  });
  const form = useForm<CreateEventFormValues>({
    resolver: zodResolver(createEventFormSchema),
    defaultValues: {
      name: "",
      dateLocal: toDateTimeLocal(new Date().toISOString()),
      description: ""
    }
  });
  const errorMessage = firstErrorMessage("Could not create the event.", createEventMutation.error);

  async function handleSubmit(values: CreateEventFormValues) {
    await createEventMutation.mutateAsync(buildCreateEventInput(values));
  }

  return (
    <div className="page-shell">
      <section className="hero">
        <div className="hero-copy">
          <p className="section-eyebrow">EventFrame</p>
          <h1>Private event albums with instant guest uploads, unlimited participants, and unlimited photo uploads.</h1>
          <p className="lede">
            Create an event, share the QR, let guests shoot with film-style filters, and collect every photo in one private album.
          </p>
          <div className="hero-pills">
            <span>Unlimited guests</span>
            <span>Unlimited uploads</span>
            <span>No guest accounts</span>
            <span>Private invite links</span>
          </div>
        </div>

        <div className="card create-card">
          <p className="section-eyebrow">Create Event</p>
          <form className="stack" onSubmit={form.handleSubmit(handleSubmit)}>
            <label>
              Event name
              <input placeholder="Friday Garden Party" {...form.register("name")} />
              <FormFieldError message={form.formState.errors.name?.message} />
            </label>
            <label>
              Event date
              <input type="datetime-local" {...form.register("dateLocal")} />
              <FormFieldError message={form.formState.errors.dateLocal?.message} />
            </label>
            <label>
              Description
              <textarea placeholder="Optional note for guests" rows={4} {...form.register("description")} />
              <FormFieldError message={form.formState.errors.description?.message} />
            </label>
            <button disabled={createEventMutation.isPending} type="submit">
              {createEventMutation.isPending ? "Creating…" : "Create event"}
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
  const eventQuery = useAdminEventQuery(adminToken);
  const eventData = eventQuery.data ?? null;
  const errorMessage = firstErrorMessage("Could not load the event.", eventQuery.error);

  if (eventQuery.isPending) {
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
  const queryClient = useQueryClient();
  const guestAlbumQueryKey = useMemo(() => queryKeys.guestAlbum(guestToken), [guestToken]);
  const storageKey = useMemo(() => `eventframe:guest-session:${guestToken}`, [guestToken]);
  const nicknameKey = useMemo(() => `eventframe:guest-nickname:${guestToken}`, [guestToken]);
  const [sessionToken, setSessionToken] = useState<string | null>(() => window.localStorage.getItem(storageKey));
  const [nickname, setNickname] = useState(() => window.localStorage.getItem(nicknameKey) ?? "");
  const albumQuery = useGuestAlbumQuery(guestToken);
  const joinForm = useForm<GuestJoinFormValues>({
    resolver: zodResolver(createGuestSessionSchema),
    defaultValues: {
      nickname: window.localStorage.getItem(nicknameKey) ?? ""
    }
  });
  const joinMutation = useMutation({
    mutationFn: (values: GuestJoinFormValues) => createGuestSession(guestToken, values.nickname ?? ""),
    onSuccess: (session) => {
      const resolvedNickname = session.nickname ?? "";
      setSessionToken(session.sessionToken);
      setNickname(resolvedNickname);
      window.localStorage.setItem(storageKey, session.sessionToken);
      window.localStorage.setItem(nicknameKey, resolvedNickname);
    }
  });
  const uploadMutation = useMutation({
    mutationFn: async (payload: {
      blob: Blob;
      fileName: string;
      filterName: string;
      width: number;
      height: number;
    }) => {
      if (!sessionToken) {
        throw new Error("Join the event before uploading.");
      }

      await uploadGuestPhoto(guestToken, sessionToken, payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: guestAlbumQueryKey });
    }
  });
  const eventData = albumQuery.data?.eventData ?? null;
  const photos = albumQuery.data?.photos ?? [];
  const errorMessage = firstErrorMessage(
    "Could not load the event.",
    albumQuery.error,
    joinMutation.error,
    uploadMutation.error
  );

  useEventSocketInvalidation(`/api/events/${guestToken}/socket`, guestAlbumQueryKey, Boolean(sessionToken));

  useEffect(() => {
    const storedSessionToken = window.localStorage.getItem(storageKey);
    const storedNickname = window.localStorage.getItem(nicknameKey) ?? "";
    setSessionToken(storedSessionToken);
    setNickname(storedNickname);
    joinForm.reset({ nickname: storedNickname });
  }, [guestToken, joinForm, nicknameKey, storageKey]);

  if (albumQuery.isPending) {
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
          <form className="stack" onSubmit={joinForm.handleSubmit((values) => joinMutation.mutateAsync(values))}>
            <label>
              Nickname
              <input placeholder="Sam" {...joinForm.register("nickname")} />
              <FormFieldError message={joinForm.formState.errors.nickname?.message} />
            </label>
            <button disabled={joinMutation.isPending} type="submit">
              {joinMutation.isPending ? "Joining…" : "Continue"}
            </button>
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
        canUpload={Boolean(sessionToken) && eventData.uploadsEnabled && !uploadMutation.isPending}
        joinRequired={!sessionToken}
        onUpload={uploadMutation.mutateAsync}
        uploadsPaused={Boolean(sessionToken) && !eventData.uploadsEnabled}
      />

      {errorMessage ? <div className="status-banner danger">{errorMessage}</div> : null}

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
  const guestAlbumQueryKey = useMemo(() => queryKeys.guestAlbum(guestToken), [guestToken]);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<string[]>([]);
  const isMobileDevice = useMemo(() => detectMobileDevice(), []);
  const albumQuery = useGuestAlbumQuery(guestToken);
  const downloadMutation = useMutation({
    mutationFn: async ({
      eventName,
      downloadType,
      photos
    }: {
      eventName: string;
      downloadType: "selection" | "album";
      photos: PhotoRecord[];
    }) => {
      if (downloadType === "selection") {
        if (isMobileDevice) {
          await downloadPhotosIndividually(eventName, photos);
          return;
        }

        await downloadPhotosAsZip(eventName, photos, "selection");
        return;
      }

      await downloadPhotosAsZip(eventName, photos, "album");
    }
  });
  const eventData = albumQuery.data?.eventData ?? null;
  const photos = albumQuery.data?.photos ?? [];
  const selectedPhotos = useMemo(
    () => photos.filter((photo) => selectedPhotoIds.includes(photo.id)),
    [photos, selectedPhotoIds]
  );
  const errorMessage = firstErrorMessage(
    "Could not load the album.",
    albumQuery.error,
    downloadMutation.error
  );

  useEventSocketInvalidation(`/api/events/${guestToken}/socket`, guestAlbumQueryKey);

  useEffect(() => {
    setSelectedPhotoIds((current) => current.filter((photoId) => photos.some((photo) => photo.id === photoId)));
  }, [photos]);

  if (albumQuery.isPending) {
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
            <button className="ghost" disabled={photos.length === 0} onClick={() => setSelectedPhotoIds(photos.map((photo) => photo.id))} type="button">
              Select all
            </button>
            <button className="ghost" disabled={selectedPhotoIds.length === 0} onClick={() => setSelectedPhotoIds([])} type="button">
              Clear
            </button>
            <button
              disabled={selectedPhotos.length === 0 || downloadMutation.isPending}
              onClick={() =>
                downloadMutation.mutateAsync({
                  eventName: eventData.name,
                  downloadType: "selection",
                  photos: selectedPhotos
                })
              }
              type="button"
            >
              {downloadMutation.isPending
                ? "Preparing…"
                : isMobileDevice
                  ? "Download selected"
                  : "Download selection ZIP"}
            </button>
            <button
              className="secondary"
              disabled={photos.length === 0 || downloadMutation.isPending}
              onClick={() =>
                downloadMutation.mutateAsync({
                  eventName: eventData.name,
                  downloadType: "album",
                  photos
                })
              }
              type="button"
            >
              Download full album ZIP
            </button>
          </div>
        </div>

        {errorMessage ? <div className="status-banner danger">{errorMessage}</div> : null}

        <DownloadGrid
          onToggle={(photoId) =>
            setSelectedPhotoIds((current) =>
              current.includes(photoId) ? current.filter((id) => id !== photoId) : [...current, photoId]
            )
          }
          photos={photos}
          selectedPhotoIds={selectedPhotoIds}
        />
      </section>
    </div>
  );
}

function AdminEventPage() {
  const { adminToken = "" } = useParams();
  const queryClient = useQueryClient();
  const adminAlbumQueryKey = useMemo(() => queryKeys.adminAlbum(adminToken), [adminToken]);
  const adminEventQueryKey = useMemo(() => queryKeys.adminEvent(adminToken), [adminToken]);
  const albumQuery = useAdminAlbumQuery(adminToken);
  const toggleUploadsMutation = useMutation({
    mutationFn: (enabled: boolean) => toggleAdminUploads(adminToken, enabled),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: adminAlbumQueryKey });
    }
  });
  const closeEventMutation = useMutation({
    mutationFn: () => closeAdminEvent(adminToken),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: adminAlbumQueryKey });
      await queryClient.invalidateQueries({ queryKey: adminEventQueryKey });
    }
  });
  const deletePhotoMutation = useMutation({
    mutationFn: (photoId: string) => deleteAdminPhoto(adminToken, photoId),
    onMutate: async (photoId) => {
      await queryClient.cancelQueries({ queryKey: adminAlbumQueryKey });

      const previousAlbum = queryClient.getQueryData<typeof albumQuery.data>(adminAlbumQueryKey);
      queryClient.setQueryData(adminAlbumQueryKey, (current: typeof albumQuery.data) =>
        current
          ? {
              ...current,
              photos: current.photos.filter((photo) => photo.id !== photoId)
            }
          : current
      );

      return { previousAlbum };
    },
    onError: (_error, _photoId, context) => {
      if (context?.previousAlbum) {
        queryClient.setQueryData(adminAlbumQueryKey, context.previousAlbum);
      }
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: adminAlbumQueryKey });
    }
  });
  const downloadMutation = useMutation({
    mutationFn: async ({ eventName, photos }: { eventName: string; photos: PhotoRecord[] }) => {
      await downloadPhotosAsZip(eventName, photos, "album");
    }
  });
  const eventData = albumQuery.data?.eventData ?? null;
  const photos = albumQuery.data?.photos ?? [];
  const errorMessage = firstErrorMessage(
    "Could not load the organizer dashboard.",
    albumQuery.error,
    toggleUploadsMutation.error,
    closeEventMutation.error,
    deletePhotoMutation.error,
    downloadMutation.error
  );

  useEventSocketInvalidation(`/api/admin/${adminToken}/socket`, adminAlbumQueryKey);

  if (albumQuery.isPending) {
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
        <button
          disabled={Boolean(eventData.endedAt) || toggleUploadsMutation.isPending}
          onClick={() => toggleUploadsMutation.mutate(eventData.uploadsEnabled ? false : true)}
          type="button"
        >
          {toggleUploadsMutation.isPending
            ? "Updating…"
            : eventData.uploadsEnabled
              ? "Pause uploads"
              : "Resume uploads"}
        </button>
        <button
          className="danger"
          disabled={Boolean(eventData.endedAt) || closeEventMutation.isPending}
          onClick={() => {
            const confirmed = window.confirm(
              "Close this event? Guests will still be able to view and download photos, but uploads will be disabled."
            );

            if (confirmed) {
              closeEventMutation.mutate();
            }
          }}
          type="button"
        >
          {eventData.endedAt ? "Event closed" : closeEventMutation.isPending ? "Closing event…" : "Close event"}
        </button>
        <button
          className="secondary"
          disabled={downloadMutation.isPending || photos.length === 0}
          onClick={() => downloadMutation.mutate({ eventName: eventData.name, photos })}
          type="button"
        >
          {downloadMutation.isPending ? "Preparing ZIP…" : "Download all"}
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
        <AlbumGrid
          deletingPhotoId={deletePhotoMutation.isPending ? deletePhotoMutation.variables : null}
          mode="admin"
          onDelete={async (photoId) => {
            await deletePhotoMutation.mutateAsync(photoId);
          }}
          photos={photos}
        />
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
        <p className="lede narrow">{formatLongDateTime(props.date)}</p>
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

function FormFieldError({ message }: { message: string | undefined }) {
  if (!message) {
    return null;
  }

  return <small className="field-error">{message}</small>;
}

function buildCreateEventInput(values: CreateEventFormValues): CreateEventInput {
  return {
    name: values.name,
    date: new Date(values.dateLocal).toISOString(),
    description: values.description ?? ""
  };
}

function extractAdminToken(adminUrl: string) {
  const url = new URL(adminUrl);
  const token = url.pathname.split("/").filter(Boolean).at(-1);

  if (!token) {
    throw new Error("The event was created, but the admin link is invalid.");
  }

  return token;
}
