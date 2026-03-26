import { useEffect, useRef } from "react";

type TurnstileWidgetProps = {
  action: string;
  onTokenChange: (token: string) => void;
  resetKey?: string | number;
  siteKey: string;
};

type TurnstileInstance = {
  remove?: (widgetId: string) => void;
  render: (
    container: HTMLElement,
    options: {
      action: string;
      callback: (token: string) => void;
      "error-callback": () => void;
      "expired-callback": () => void;
      sitekey: string;
      theme: "light";
    }
  ) => string;
};

declare global {
  interface Window {
    turnstile?: TurnstileInstance;
  }
}

let turnstileScriptPromise: Promise<void> | null = null;

export function TurnstileWidget({ action, onTokenChange, resetKey, siteKey }: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    onTokenChange("");

    void loadTurnstileScript().then(() => {
      if (cancelled || !containerRef.current || !window.turnstile) {
        return;
      }

      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        action,
        theme: "light",
        callback: (token) => {
          onTokenChange(token);
        },
        "expired-callback": () => {
          onTokenChange("");
        },
        "error-callback": () => {
          onTokenChange("");
        }
      });
    });

    return () => {
      cancelled = true;
      onTokenChange("");

      if (widgetIdRef.current && window.turnstile?.remove) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }

      if (containerRef.current) {
        containerRef.current.innerHTML = "";
      }
    };
  }, [action, onTokenChange, resetKey, siteKey]);

  return (
    <div className="turnstile-block">
      <div className="turnstile-widget" ref={containerRef} />
      <small className="muted">Human verification protects event creation and guest joins from automated abuse.</small>
    </div>
  );
}

function loadTurnstileScript() {
  if (typeof window === "undefined") {
    return Promise.resolve();
  }

  if (window.turnstile) {
    return Promise.resolve();
  }

  if (turnstileScriptPromise) {
    return turnstileScriptPromise;
  }

  turnstileScriptPromise = new Promise<void>((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>('script[data-turnstile-script="true"]');
    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(), { once: true });
      existingScript.addEventListener("error", () => reject(new Error("Could not load Turnstile.")), {
        once: true
      });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.dataset.turnstileScript = "true";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Could not load Turnstile."));
    document.head.appendChild(script);
  });

  return turnstileScriptPromise;
}
