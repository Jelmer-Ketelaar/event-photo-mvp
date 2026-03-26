import { zip } from "fflate";
import type { PhotoRecord } from "@event-photo/shared";
import { toAbsoluteMediaUrl } from "./api";
import { formatUploaderFileToken, sanitizeFileName } from "./format";

export async function downloadPhotosAsZip(eventName: string, photos: PhotoRecord[], fileLabel = "album") {
  const zipEntries: Record<string, Uint8Array> = {};

  for (const photo of photos) {
    const bytes = await fetchPhotoBytes(photo);
    zipEntries[buildPhotoFileName(eventName, photo)] = bytes;
  }

  const archive = await new Promise<Uint8Array>((resolve, reject) => {
    zip(zipEntries, { level: 0 }, (error, data) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(data);
    });
  });

  const zipBytes = new Uint8Array(archive.byteLength);
  zipBytes.set(archive);

  downloadBlob(new Blob([zipBytes], { type: "application/zip" }), `${sanitizeFileName(eventName)}-${fileLabel}.zip`);
}

export async function downloadPhotosIndividually(eventName: string, photos: PhotoRecord[]) {
  for (const [index, photo] of photos.entries()) {
    const bytes = await fetchPhotoBytes(photo);
    const blob = new Blob([bytes], { type: "image/jpeg" });
    downloadBlob(blob, buildPhotoFileName(eventName, photo));

    if (index < photos.length - 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 180));
    }
  }
}

async function fetchPhotoBytes(photo: PhotoRecord) {
  const response = await fetch(toAbsoluteMediaUrl(photo.imageUrl));
  if (!response.ok) {
    throw new Error("Could not download one or more photos.");
  }

  return new Uint8Array(await response.arrayBuffer());
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function buildPhotoFileName(eventName: string, photo: PhotoRecord) {
  return `${sanitizeFileName(eventName)}-${formatUploaderFileToken(photo.uploaderNickname)}-${photo.id}.jpg`;
}
