import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ChefHat, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { activateProAccess } from "@/lib/access.functions";

export const Route = createFileRoute("/betalt")({
  component: Betalt,
  head: () => ({
    meta: [
      { title: "Velkommen som abonnent – Restemat" },
      { name: "description", content: "Du har nå ubegrenset tilgang til Restemat." },
      { name: "robots", content: "noindex" },
    ],
  }),
});

type Status = "loading" | "success" | "error";

function Betalt() {
  const [status, setStatus] = useState<Status>("loading");
  const [debugError, setDebugError] = useState<string | null>(null);
  const activate = useServerFn(activateProAccess);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sessionId = new URLSearchParams(window.location.search).get("session_id");
    if (!sessionId) {
      setStatus("error");
      return;
    }
    let cancelled = false;
    activate({ data: { sessionId } })
      .then((res) => {
        if (cancelled) return;
        if (res?.ok) {
          setStatus("success");
        } else {
          setStatus("error");
          setDebugError(res?.debugError ?? null);
        }
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [activate]);

  if (status === "loading") {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col items-center justify-center gap-4 px-5 py-10 text-center sm:py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-muted-foreground">Bekrefter betalingen…</p>
      </main>
    );
  }

  if (status === "error") {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col items-center gap-6 px-5 py-10 text-center sm:py-16">
        <h1 className="text-2xl font-semibold sm:text-3xl">Noe gikk galt</h1>
        <p className="max-w-sm text-balance text-muted-foreground">
          Vi fikk ikke bekreftet betalingen. Prøv igjen, eller kontakt support.
        </p>
        {debugError && (
          <pre className="max-w-sm w-full whitespace-pre-wrap rounded-lg bg-muted p-3 text-left text-xs text-muted-foreground">
            {debugError}
          </pre>
        )}
        <Link to="/oppgrader" className="w-full max-w-xs">
          <Button size="lg" className="h-12 w-full rounded-xl text-base font-semibold">
            Tilbake til oppgradering
          </Button>
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col items-center gap-6 px-5 py-10 text-center sm:py-16">
      <div className="relative">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
          <ChefHat className="h-8 w-8" />
        </div>
        <div className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-success text-success-foreground shadow">
          <Check className="h-4 w-4" />
        </div>
      </div>
      <h1 className="text-3xl font-semibold sm:text-4xl">Velkommen til Restemat</h1>
      <p className="max-w-sm text-balance text-muted-foreground">
        Abonnementet ditt er aktivt.
      </p>
      <Link to="/" className="w-full max-w-xs">
        <Button size="lg" className="h-12 w-full rounded-xl text-base font-semibold">
          Finn middag nå →
        </Button>
      </Link>
    </main>
  );
}
