import { FILTER_PRESETS, type FilterId } from "@event-photo/shared";

const MAX_LONG_EDGE = 1600;
const JPEG_QUALITY = 0.78;

export type PreparedImage = {
  blob: Blob;
  width: number;
  height: number;
  previewUrl: string;
};

export async function prepareFilteredImage(file: File, filterId: FilterId): Promise<PreparedImage> {
  const preset = FILTER_PRESETS.find((item) => item.id === filterId) ?? FILTER_PRESETS[0];
  const bitmap = await createImageBitmap(file);
  const { width, height } = containWithin(bitmap.width, bitmap.height, MAX_LONG_EDGE);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Canvas is not available in this browser.");
  }

  context.filter = preset.cssFilter;
  context.drawImage(bitmap, 0, 0, width, height);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => {
      if (!result) {
        reject(new Error("Could not export the image."));
        return;
      }

      resolve(result);
    }, "image/jpeg", JPEG_QUALITY);
  });

  bitmap.close();

  return {
    blob,
    width,
    height,
    previewUrl: URL.createObjectURL(blob)
  };
}

function containWithin(width: number, height: number, maxLongEdge: number) {
  const longEdge = Math.max(width, height);
  if (longEdge <= maxLongEdge) {
    return { width, height };
  }

  const scale = maxLongEdge / longEdge;
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale)
  };
}
