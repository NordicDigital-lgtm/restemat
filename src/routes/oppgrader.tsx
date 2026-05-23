import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ChefHat, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/oppgrader")({
  component: Oppgrader,
  head: () => ({
    meta: [
      { title: "Få full tilgang – Restemat" },
      { name: "description", content: "Oppgrader for ubegrenset tilgang til Restemat." },
    ],
  }),
});

function Oppgrader() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col gap-6 px-5 py-10 sm:py-16">
      <header className="flex flex-col items-center text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
          <ChefHat className="h-7 w-7" />
        </div>
        <h1 className="text-3xl font-semibold sm:text-4xl">Få full tilgang</h1>
        <p className="mt-3 max-w-sm text-balance text-muted-foreground">
          Ubegrenset tilgang til Restemat – kommer snart. La oss vite at du er interessert!
        </p>
      </header>

      <div className="rounded-3xl border border-border/60 bg-card p-6 shadow-sm">
        <ul className="flex flex-col gap-3 text-sm text-foreground/90">
          <li>✓ Ubegrenset antall søk per dag</li>
          <li>✓ Lagre favorittoppskrifter</li>
          <li>✓ Tilpasset ditt kjøleskap</li>
        </ul>
      </div>

      <Link to="/">
        <Button variant="outline" size="lg" className="h-12 w-full rounded-xl text-base font-semibold">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Tilbake
        </Button>
      </Link>
    </main>
  );
}
