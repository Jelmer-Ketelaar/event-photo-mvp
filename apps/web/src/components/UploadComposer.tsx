import { useEffect, useMemo, useRef, useState } from "react";
import { FILTER_PRESETS, type FilterId } from "@event-photo/shared";
import { prepareFilteredImage } from "../lib/image";

type UploadComposerProps = {
  canUpload: boolean;
  joinRequired?: boolean;
  uploadsPaused?: boolean;
  onUpload: (payload: {
    blob: Blob;
    fileName: string;
    filterName: string;
    width: number;
    height: number;
  }) => Promise<void>;
};

export function UploadComposer({
  canUpload,
  joinRequired = false,
  uploadsPaused = false,
  onUpload
}: UploadComposerProps) {
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [selectedFilter, setSelectedFilter] = useState<FilterId>("original");
  const [prepared, setPrepared] = useState<{
    blob: Blob;
    width: number;
    height: number;
    previewUrl: string;
  } | null>(null);
  const [isPreparing, setIsPreparing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const activePreviewUrl = useMemo(() => prepared?.previewUrl ?? "", [prepared]);

  useEffect(() => {
    if (!sourceFile) {
      setPrepared(null);
      return;
    }

    let cancelled = false;
    setIsPreparing(true);
    setErrorMessage(null);

    prepareFilteredImage(sourceFile, selectedFilter)
      .then((result) => {
        if (cancelled) {
          URL.revokeObjectURL(result.previewUrl);
          return;
        }

        setPrepared((previous) => {
          if (previous) {
            URL.revokeObjectURL(previous.previewUrl);
          }
          return result;
        });
      })
      .catch((error: Error) => {
        if (!cancelled) {
          setErrorMessage(error.message);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsPreparing(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedFilter, sourceFile]);

  useEffect(() => {
    return () => {
      if (prepared) {
        URL.revokeObjectURL(prepared.previewUrl);
      }
    };
  }, [prepared]);

  async function handleUpload() {
    if (!prepared || !sourceFile) {
      return;
    }

    setIsUploading(true);
    setErrorMessage(null);

    try {
      await onUpload({
        blob: prepared.blob,
        fileName: sourceFile.name.replace(/\.[^.]+$/, "") + ".jpg",
        filterName: selectedFilter,
        width: prepared.width,
        height: prepared.height
      });

      setSourceFile(null);
      setPrepared((previous) => {
        if (previous) {
          URL.revokeObjectURL(previous.previewUrl);
        }
        return null;
      });
      setSelectedFilter("original");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setIsUploading(false);
    }
  }

  function handlePick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) {
      setSourceFile(file);
    }

    event.target.value = "";
  }

  return (
    <section className="composer-card">
      <div className="composer-header">
        <div>
          <p className="section-eyebrow">Capture</p>
          <h2>Take a photo or bring one in from your gallery.</h2>
        </div>
        <div className="composer-actions">
          <button disabled={!canUpload} onClick={() => cameraInputRef.current?.click()} type="button">
            Camera
          </button>
          <button className="secondary" disabled={!canUpload} onClick={() => galleryInputRef.current?.click()} type="button">
            Gallery
          </button>
        </div>
      </div>

      <input accept="image/*" capture="environment" hidden onChange={handlePick} ref={cameraInputRef} type="file" />
      <input accept="image/*" hidden onChange={handlePick} ref={galleryInputRef} type="file" />

      {joinRequired ? (
        <div className="status-banner">Join the event first to start uploading.</div>
      ) : null}

      {uploadsPaused ? (
        <div className="status-banner warning">Uploads are currently paused by the organizer.</div>
      ) : null}

      {sourceFile ? (
        <div className="preview-grid">
          <div className="preview-panel">
            {activePreviewUrl ? (
              <img alt="Selected preview" className="preview-image" src={activePreviewUrl} />
            ) : (
              <div className="preview-placeholder">Preparing preview…</div>
            )}
          </div>

          <div className="filter-panel">
            <p className="section-eyebrow">Filters</p>
            <div className="filter-list">
              {FILTER_PRESETS.map((preset) => (
                <button
                  className={preset.id === selectedFilter ? "filter-chip active" : "filter-chip"}
                  key={preset.id}
                  onClick={() => setSelectedFilter(preset.id)}
                  type="button"
                >
                  <span>{preset.label}</span>
                  <small>{preset.description}</small>
                </button>
              ))}
            </div>
            <button disabled={isPreparing || isUploading || !canUpload} onClick={handleUpload} type="button">
              {isUploading ? "Uploading…" : "Upload photo"}
            </button>
            {errorMessage ? <div className="status-banner danger">{errorMessage}</div> : null}
          </div>
        </div>
      ) : (
        <div className="empty-state compact">
          <p>Choose a photo to preview filters before uploading.</p>
        </div>
      )}
    </section>
  );
}
