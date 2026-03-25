import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { isNativeApp } from "./platform";

type MediaSource = "camera" | "gallery";

export async function pickPhotoFromDevice(source: MediaSource) {
  if (!isNativeApp()) {
    return null;
  }

  const photo = await Camera.getPhoto({
    source: source === "camera" ? CameraSource.Camera : CameraSource.Photos,
    resultType: CameraResultType.Uri,
    quality: 90,
    width: 2400,
    correctOrientation: true
  });

  if (!photo.webPath) {
    return null;
  }

  const response = await fetch(photo.webPath);
  const blob = await response.blob();
  const extension = normalizeExtension(photo.format);
  const mimeType = blob.type || `image/${extension}`;

  return new File([blob], `eventframe-${source}-${Date.now()}.${extension}`, {
    type: mimeType
  });
}

function normalizeExtension(format: string | undefined) {
  if (!format) {
    return "jpeg";
  }

  return format === "jpg" ? "jpeg" : format.toLowerCase();
}
