import type { PhotoRecord } from "@event-photo/shared";
import { toAbsoluteMediaUrl } from "../lib/api";
import { formatShortDateTime, formatUploaderLabel } from "../lib/format";

type AlbumGridMode = "guest" | "admin";

type AlbumGridProps = {
  photos: PhotoRecord[];
  mode: AlbumGridMode;
  deletingPhotoId?: string | null;
  onDelete?: (photoId: string) => Promise<void> | void;
};

type PhotoCardProps = {
  photo: PhotoRecord;
  mode: AlbumGridMode;
  isDeleting: boolean;
  onDelete?: (photoId: string) => Promise<void> | void;
};

/** Displays a grid of photos with optional admin controls */
export function AlbumGrid({ photos, mode, deletingPhotoId = null, onDelete }: AlbumGridProps) {
  if (photos.length === 0) {
    return <EmptyAlbumState />;
  }

  return (
    <div className="album-grid">
      {photos.map((photo) => (
        <PhotoCard
          key={photo.id}
          isDeleting={deletingPhotoId === photo.id}
          mode={mode}
          onDelete={onDelete}
          photo={photo}
        />
      ))}
    </div>
  );
}

/** Empty state shown when no photos have been uploaded */
function EmptyAlbumState() {
  return (
    <div className="empty-state">
      <p>No photos yet.</p>
      <span>The first upload appears here instantly.</span>
    </div>
  );
}

/** Individual photo card with image, metadata, and optional delete action */
function PhotoCard({ photo, mode, isDeleting, onDelete }: PhotoCardProps) {
  const uploaderLabel = formatUploaderLabel(photo.uploaderNickname);
  const showDeleteButton = mode === "admin" && onDelete;

  return (
    <article className="photo-card">
      <div className="photo-image-shell">
        <img
          alt={uploaderLabel}
          loading="lazy"
          src={toAbsoluteMediaUrl(photo.imageUrl)}
        />
        <span className="photo-attribution">{uploaderLabel}</span>
      </div>

      <div className="photo-meta">
        <div>
          <strong>{uploaderLabel}</strong>
          <span>{formatShortDateTime(photo.createdAt)}</span>
        </div>
        <span className="photo-badge">{photo.filterName}</span>
      </div>

      {showDeleteButton && (
        <div className="photo-actions">
          <button
            className="ghost danger subtle-button"
            disabled={isDeleting}
            onClick={() => onDelete(photo.id)}
            type="button"
          >
            {isDeleting ? "Removing…" : "Remove"}
          </button>
        </div>
      )}
    </article>
  );
}
