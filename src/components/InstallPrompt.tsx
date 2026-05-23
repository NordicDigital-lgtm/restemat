import { useEffect, useState } from "react";
import { Download, X, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const DISMISS_KEY = "restemat_install_dismissed";

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<Event | null>(null);
  const [visible, setVisible] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Already installed or already dismissed?
    const dismissed = window.localStorage.getItem(DISMISS_KEY);
    if (dismissed) return;

    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as unknown as Record<string, boolean>).standalone === true;
    if (standalone) return;

    const ua = navigator.userAgent.toLowerCase();
    const ios = /iphone|ipad|ipod/.test(ua);
    setIsIOS(ios);

    if (ios) {
      // iOS Safari doesn't fire beforeinstallprompt; show hint after a delay
      const t = setTimeout(() => setVisible(true), 4000);
      return () => clearTimeout(t);
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setVisible(true);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleDismiss = () => {
    setVisible(false);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(DISMISS_KEY, "true");
    }
  };

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    // Cast to any because beforeinstallprompt event is non-standard
    const promptEvent = deferredPrompt as unknown as {
      prompt: () => Promise<void>;
      userChoice: Promise<{ outcome: string }>;
    };
    await promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    if (outcome === "accepted") {
      setVisible(false);
    } else {
      // Keep showing; user might want to try again
    }
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/60 bg-card/95 p-4 shadow-lg backdrop-blur-sm sm:bottom-4 sm:left-auto sm:right-4 sm:w-80 sm:rounded-2xl sm:border">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <p className="text-sm font-semibold text-foreground">
            Legg til på hjemskjermen
          </p>
          {isIOS ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Trykk <Share2 className="mx-0.5 inline h-3 w-3" /> nederst og velg
              "Legg til på Hjem-skjermen" for en appopplevelse.
            </p>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">
              Installer Restemat for rask tilgang uten adresselinje.
            </p>
          )}
        </div>
        <button
          onClick={handleDismiss}
          className="shrink-0 rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Lukk"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {!isIOS && (
        <Button
          size="sm"
          onClick={handleInstall}
          className="mt-3 h-9 w-full rounded-full bg-primary text-xs font-semibold text-primary-foreground hover:bg-primary/90"
        >
          <Download className="mr-1.5 h-3.5 w-3.5" />
          Installer
        </Button>
      )}
    </div>
  );
}
