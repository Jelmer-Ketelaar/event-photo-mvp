import type { PhotoRecord } from "@event-photo/shared";
import { toAbsoluteMediaUrl } from "../lib/api";
import { formatShortDateTime } from "../lib/format";

type DownloadGridProps = {
  photos: PhotoRecord[];
  selectedPhotoIds: string[];
  onToggle: (photoId: string) => void;
};

export function DownloadGrid({ photos, selectedPhotoIds, onToggle }: DownloadGridProps) {
  if (photos.length === 0) {
    return (
      <div className="empty-state">
        <p>No photos available yet.</p>
        <span>Come back once guests start uploading.</span>
      </div>
    );
  }

  const selectedIds = new Set(selectedPhotoIds);

  return (
    <div className="download-grid">
      {photos.map((photo) => {
        const isSelected = selectedIds.has(photo.id);

        return (
          <button
            className={isSelected ? "download-card selected" : "download-card"}
            key={photo.id}
            onClick={() => onToggle(photo.id)}
            type="button"
          >
            <span className="download-card-check" aria-hidden="true">
              {isSelected ? "✓" : ""}
            </span>
            <img alt={photo.uploaderNickname ?? "Guest upload"} loading="lazy" src={toAbsoluteMediaUrl(photo.imageUrl)} />
            <span className="download-card-footer">
              <strong>{photo.uploaderNickname ?? "Guest"}</strong>
              <small>{formatShortDateTime(photo.createdAt)}</small>
            </span>
          </button>
        );
      })}
    </div>
  );
}
