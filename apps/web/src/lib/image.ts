import { FILTER_PRESETS, type FilterId } from "@event-photo/shared";

/** Maximum dimension for the longest edge of processed images (px) */
const MAX_LONG_EDGE = 1600;

/** JPEG compression quality (0-1) */
const JPEG_QUALITY = 0.78;

/** MIME type for exported images */
const OUTPUT_MIME_TYPE = "image/jpeg";

/** Result of preparing an image for upload */
export type PreparedImage = {
  blob: Blob;
  width: number;
  height: number;
  previewUrl: string;
};

/**
 * Prepares an image file for upload by applying a filter and resizing.
 * - Resizes to fit within MAX_LONG_EDGE while maintaining aspect ratio
 * - Applies the selected CSS filter
 * - Exports as JPEG for consistent file size
 * - Creates a preview URL for display
 */
export async function prepareFilteredImage(
  file: File,
  filterId: FilterId
): Promise<PreparedImage> {
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

  // Apply filter and draw resized image
  context.filter = preset.cssFilter;
  context.drawImage(bitmap, 0, 0, width, height);

  const blob = await exportCanvasToBlob(canvas);
  bitmap.close();

  return {
    blob,
    width,
    height,
    previewUrl: URL.createObjectURL(blob)
  };
}

/** Exports a canvas to a JPEG blob */
async function exportCanvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => {
        if (!result) {
          reject(new Error("Could not export the image."));
          return;
        }
        resolve(result);
      },
      OUTPUT_MIME_TYPE,
      JPEG_QUALITY
    );
  });
}

/**
 * Calculates dimensions to contain an image within a maximum long edge.
 * Maintains aspect ratio and returns original dimensions if already within bounds.
 */
function containWithin(
  width: number,
  height: number,
  maxLongEdge: number
): { width: number; height: number } {
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
