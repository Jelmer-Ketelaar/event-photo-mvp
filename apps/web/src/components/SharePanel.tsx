import { useEffect, useState, useCallback } from "react";
import QRCode from "qrcode";
import { copyText } from "../lib/clipboard";

type SharePanelProps = {
  guestInviteUrl: string;
  adminUrl: string;
};

type CopyState = "idle" | "success" | "error";

/** QR code generation configuration */
const QR_CONFIG = {
  width: 360,
  margin: 1,
  color: {
    dark: "#0e1b16",
    light: "#f4efe7"
  }
} as const;

/** Duration to show copy feedback before resetting (ms) */
const COPY_FEEDBACK_DURATION_MS = 1800;

/** Displays QR code and shareable links for event access */
export function SharePanel({ guestInviteUrl, adminUrl }: SharePanelProps) {
  const [qrUrl, setQrUrl] = useState("");
  const [guestCopyState, setGuestCopyState] = useState<CopyState>("idle");
  const [adminCopyState, setAdminCopyState] = useState<CopyState>("idle");

  useEffect(() => {
    QRCode.toDataURL(guestInviteUrl, QR_CONFIG).then(setQrUrl);
  }, [guestInviteUrl]);

  const handleCopy = useCallback(async (kind: "guest" | "admin", value: string) => {
    const copied = await copyText(value);
    const newState: CopyState = copied ? "success" : "error";

    if (kind === "guest") {
      setGuestCopyState(newState);
    } else {
      setAdminCopyState(newState);
    }

    window.setTimeout(() => {
      if (kind === "guest") {
        setGuestCopyState("idle");
      } else {
        setAdminCopyState("idle");
      }
    }, COPY_FEEDBACK_DURATION_MS);
  }, []);

  return (
    <section className="share-panel">
      <div>
        <p className="section-eyebrow">Share Event</p>
        <h2>Guests can join instantly with a link or QR.</h2>
        <p>Save the admin link somewhere safe. Guests only need the guest link.</p>
      </div>

      <div className="share-grid">
        <QRCodeCard qrUrl={qrUrl} />

        <div className="share-links">
          <ShareLinkField
            copyState={guestCopyState}
            label="Guest link"
            linkLabel="Open guest page"
            onCopy={() => handleCopy("guest", guestInviteUrl)}
            url={guestInviteUrl}
          />
          <ShareLinkField
            copyState={adminCopyState}
            label="Admin link"
            linkLabel="Open admin page"
            onCopy={() => handleCopy("admin", adminUrl)}
            url={adminUrl}
          />
        </div>
      </div>
    </section>
  );
}

/** Displays the QR code image */
function QRCodeCard({ qrUrl }: { qrUrl: string }) {
  if (!qrUrl) {
    return <div className="qr-card" />;
  }

  return (
    <div className="qr-card">
      <img alt="Event QR code" src={qrUrl} />
    </div>
  );
}

type ShareLinkFieldProps = {
  label: string;
  url: string;
  linkLabel: string;
  copyState: CopyState;
  onCopy: () => void;
};

/** Individual share link field with copy button */
function ShareLinkField({ label, url, linkLabel, copyState, onCopy }: ShareLinkFieldProps) {
  return (
    <label>
      {label}
      <div className="copy-row">
        <input readOnly value={url} />
        <div className="copy-actions">
          <button onClick={onCopy} type="button">
            {getCopyLabel(copyState)}
          </button>
          <a className="ghost-link action-link" href={url} rel="noreferrer" target="_blank">
            {linkLabel}
          </a>
        </div>
      </div>
    </label>
  );
}

/** Maps copy state to button label */
function getCopyLabel(state: CopyState): string {
  const labels: Record<CopyState, string> = {
    idle: "Copy",
    success: "Copied",
    error: "Copy failed"
  };
  return labels[state];
}
