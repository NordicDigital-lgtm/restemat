import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { ChefHat, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

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

function Betalt() {
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("isPro", "1");
    }
  }, []);

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
        Abonnementet ditt er aktivt. Nå kan du få raske middagsforslag, bruke opp rester og gjøre hverdagen litt enklere.
      </p>
      <Link to="/" className="w-full max-w-xs">
        <Button size="lg" className="h-12 w-full rounded-xl text-base font-semibold">
          Finn middag nå →
        </Button>
      </Link>
    </main>
  );
}
