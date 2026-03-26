import type { PhotoRecord } from "@event-photo/shared";
import { toAbsoluteMediaUrl } from "../lib/api";
import { formatShortDateTime, formatUploaderLabel } from "../lib/format";

type AlbumGridProps = {
  photos: PhotoRecord[];
  mode: "guest" | "admin";
  deletingPhotoId?: string | null;
  onDelete?: (photoId: string) => Promise<void> | void;
};

export function AlbumGrid({ photos, mode, deletingPhotoId = null, onDelete }: AlbumGridProps) {
  if (photos.length === 0) {
    return (
      <div className="empty-state">
        <p>No photos yet.</p>
        <span>The first upload appears here instantly.</span>
      </div>
    );
  }

  return (
    <div className="album-grid">
      {photos.map((photo) => (
        <article className="photo-card" key={photo.id}>
          <div className="photo-image-shell">
            <img alt={formatUploaderLabel(photo.uploaderNickname)} loading="lazy" src={toAbsoluteMediaUrl(photo.imageUrl)} />
            <span className="photo-attribution">{formatUploaderLabel(photo.uploaderNickname)}</span>
          </div>
          <div className="photo-meta">
            <div>
              <strong>{formatUploaderLabel(photo.uploaderNickname)}</strong>
              <span>{formatShortDateTime(photo.createdAt)}</span>
            </div>
            <span className="photo-badge">{photo.filterName}</span>
          </div>
          {mode === "admin" && onDelete ? (
            <div className="photo-actions">
              <button
                className="ghost danger subtle-button"
                disabled={deletingPhotoId === photo.id}
                onClick={() => onDelete(photo.id)}
                type="button"
              >
                {deletingPhotoId === photo.id ? "Removing…" : "Remove"}
              </button>
            </div>
          ) : null}
        </article>
      ))}
    </div>
  );
}
