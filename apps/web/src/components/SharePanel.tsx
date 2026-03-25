import { useEffect, useState } from "react";
import QRCode from "qrcode";

type SharePanelProps = {
  guestInviteUrl: string;
  adminUrl: string;
};

export function SharePanel({ guestInviteUrl, adminUrl }: SharePanelProps) {
  const [qrUrl, setQrUrl] = useState("");

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
              <button onClick={() => navigator.clipboard.writeText(guestInviteUrl)} type="button">
                Copy
              </button>
            </div>
          </label>
          <label>
            Admin link
            <div className="copy-row">
              <input readOnly value={adminUrl} />
              <button onClick={() => navigator.clipboard.writeText(adminUrl)} type="button">
                Copy
              </button>
            </div>
          </label>
        </div>
      </div>
    </section>
  );
}
