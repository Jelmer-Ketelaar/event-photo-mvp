import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { copyText } from "../lib/clipboard";

type SharePanelProps = {
  guestInviteUrl: string;
  adminUrl: string;
};

type CopyState = "idle" | "success" | "error";

export function SharePanel({ guestInviteUrl, adminUrl }: SharePanelProps) {
  const [qrUrl, setQrUrl] = useState("");
  const [guestCopyState, setGuestCopyState] = useState<CopyState>("idle");
  const [adminCopyState, setAdminCopyState] = useState<CopyState>("idle");

  useEffect(() => {
    QRCode.toDataURL(guestInviteUrl, {
      width: 360,
      margin: 1,
      color: {
        dark: "#0e1b16",
        light: "#f4efe7"
      }
    }).then(setQrUrl);
  }, [guestInviteUrl]);

  async function handleCopy(kind: "guest" | "admin", value: string) {
    const copied = await copyText(value);

    if (kind === "guest") {
      setGuestCopyState(copied ? "success" : "error");
    } else {
      setAdminCopyState(copied ? "success" : "error");
    }

    window.setTimeout(() => {
      if (kind === "guest") {
        setGuestCopyState("idle");
      } else {
        setAdminCopyState("idle");
      }
    }, 1800);
  }

  return (
    <section className="share-panel">
      <div>
        <p className="section-eyebrow">Share Event</p>
        <h2>Guests can join instantly with a link or QR.</h2>
        <p>
          Save the admin link somewhere safe. Guests only need the guest link.
        </p>
      </div>

      <div className="share-grid">
        <div className="qr-card">
          {qrUrl ? <img alt="Event QR code" src={qrUrl} /> : null}
        </div>
        <div className="share-links">
          <label>
            Guest link
            <div className="copy-row">
              <input readOnly value={guestInviteUrl} />
              <div className="copy-actions">
                <button onClick={() => handleCopy("guest", guestInviteUrl)} type="button">
                  {getCopyLabel(guestCopyState)}
                </button>
                <a className="ghost-link action-link" href={guestInviteUrl} rel="noreferrer" target="_blank">
                  Open guest page
                </a>
              </div>
            </div>
          </label>
          <label>
            Admin link
            <div className="copy-row">
              <input readOnly value={adminUrl} />
              <div className="copy-actions">
                <button onClick={() => handleCopy("admin", adminUrl)} type="button">
                  {getCopyLabel(adminCopyState)}
                </button>
                <a className="ghost-link action-link" href={adminUrl} rel="noreferrer" target="_blank">
                  Open admin page
                </a>
              </div>
            </div>
          </label>
        </div>
      </div>
    </section>
  );
}

function getCopyLabel(copyState: CopyState) {
  if (copyState === "success") {
    return "Copied";
  }

  if (copyState === "error") {
    return "Copy failed";
  }

  return "Copy";
}
