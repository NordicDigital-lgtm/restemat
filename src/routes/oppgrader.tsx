import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ChefHat, ArrowLeft, Check } from "lucide-react";

export const Route = createFileRoute("/oppgrader")({
  component: Oppgrader,
  head: () => ({
    meta: [
      { title: "Få full tilgang – Restemat" },
      { name: "description", content: "Oppgrader for ubegrenset tilgang til Restemat. Lag middag av restene, hver dag." },
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
        <h1 className="text-3xl font-semibold sm:text-4xl">Ubegrenset Restemat</h1>
        <p className="mt-3 max-w-sm text-balance font-medium text-muted-foreground">
          Lag middag av det du har, hver dag.
        </p>
      </header>

      <div className="rounded-3xl border border-border/60 bg-card p-6 shadow-sm sm:p-7">
        <div className="mb-5 flex items-baseline justify-center gap-2 border-b border-border/60 pb-5">
          <span className="text-5xl font-bold text-foreground">49 kr</span>
          <span className="text-muted-foreground">/mnd</span>
        </div>

        <ul className="flex flex-col gap-3.5 text-sm text-foreground/90">
          <li className="flex gap-3">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
            <span><span className="font-semibold">Ubegrenset søk</span> – gå aldri tom for middagstips</span>
          </li>
          <li className="flex gap-3">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
            <span><span className="font-semibold">Bruk opp restene</span> – mindre matsvinn, mer for pengene</span>
          </li>
          <li className="flex gap-3">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
            <span><span className="font-semibold">Generer ny oppskrift</span> hvis den første ikke frister</span>
          </li>
          <li className="flex gap-3">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
            <span><span className="font-semibold">Avbryt når som helst</span> – ingen binding</span>
          </li>
        </ul>
      </div>

      <a href="https://buy.stripe.com/fZufZiaFF8nh5wt3sK2Ry00" target="_blank" rel="noopener noreferrer">
        <Button size="lg" className="inline-flex h-12 w-full items-center justify-center rounded-xl text-base font-semibold">
          Start abonnement →
        </Button>
      </a>

      <p className="text-center text-xs text-muted-foreground">
        Sikker betaling via Stripe. Avbryt når som helst.
      </p>

      <Link to="/">
        <Button variant="outline" size="lg" className="inline-flex h-12 w-full items-center justify-center rounded-xl text-base font-semibold">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Tilbake
        </Button>
      </Link>
    </main>
  );
}
