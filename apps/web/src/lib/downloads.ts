import { zip } from "fflate";
import type { PhotoRecord } from "@event-photo/shared";
import { toAbsoluteMediaUrl } from "./api";
import { formatUploaderFileToken, sanitizeFileName } from "./format";

/** Delay between individual downloads to avoid browser throttling (ms) */
const DOWNLOAD_THROTTLE_MS = 180;

/** Delay before revoking blob URLs after download (ms) */
const BLOB_CLEANUP_DELAY_MS = 1000;

/** MIME types for generated files */
const MIME_TYPES = {
  ZIP: "application/zip",
  JPEG: "image/jpeg"
} as const;

/**
 * Downloads multiple photos as a single ZIP archive.
 * Uses no compression (level: 0) since JPEGs are already compressed.
 */
export async function downloadPhotosAsZip(
  eventName: string,
  photos: PhotoRecord[],
  fileLabel = "album"
): Promise<void> {
  const zipEntries: Record<string, Uint8Array> = {};

  for (const photo of photos) {
    const bytes = await fetchPhotoBytes(photo);
    zipEntries[buildPhotoFileName(eventName, photo)] = bytes;
  }

  const archive = await createZipArchive(zipEntries);
  const zipBlob = new Blob([archive.buffer.slice(archive.byteOffset, archive.byteOffset + archive.byteLength)], { type: MIME_TYPES.ZIP });
  
  downloadBlob(zipBlob, `${sanitizeFileName(eventName)}-${fileLabel}.zip`);
}

/**
 * Downloads photos one at a time with throttling.
 * Used on mobile devices where ZIP downloads may not work well.
 */
export async function downloadPhotosIndividually(
  eventName: string,
  photos: PhotoRecord[]
): Promise<void> {
  for (const [index, photo] of photos.entries()) {
    const bytes = await fetchPhotoBytes(photo);
    const blob = new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)], { type: MIME_TYPES.JPEG });
    downloadBlob(blob, buildPhotoFileName(eventName, photo));

    // Throttle downloads to avoid browser issues
    const isLastPhoto = index === photos.length - 1;
    if (!isLastPhoto) {
      await delay(DOWNLOAD_THROTTLE_MS);
    }
  }
}

/** Creates a ZIP archive from a record of file entries */
async function createZipArchive(entries: Record<string, Uint8Array>): Promise<Uint8Array> {
  return new Promise<Uint8Array>((resolve, reject) => {
    zip(entries, { level: 0 }, (error, data) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(data);
    });
  });
}

/** Fetches photo bytes from the API */
async function fetchPhotoBytes(photo: PhotoRecord): Promise<Uint8Array> {
  const response = await fetch(toAbsoluteMediaUrl(photo.imageUrl));
  
  if (!response.ok) {
    throw new Error("Could not download one or more photos.");
  }

  return new Uint8Array(await response.arrayBuffer());
}

/** Triggers a file download via a temporary anchor element */
function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  
  // Clean up blob URL after download starts
  window.setTimeout(() => URL.revokeObjectURL(url), BLOB_CLEANUP_DELAY_MS);
}

/** Builds a descriptive file name for a photo */
function buildPhotoFileName(eventName: string, photo: PhotoRecord): string {
  const sanitizedEvent = sanitizeFileName(eventName);
  const uploaderToken = formatUploaderFileToken(photo.uploaderNickname);
  return `${sanitizedEvent}-${uploaderToken}-${photo.id}.jpg`;
}

/** Promise-based delay helper */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
