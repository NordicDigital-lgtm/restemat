import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { findRecipe, type RecipeResult, cleanIngredientName, stripWrappingBrackets } from "@/lib/recipe.functions";
import { InstallPrompt } from "@/components/InstallPrompt";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, ChefHat, Check, ShoppingBasket, ListOrdered, UtensilsCrossed, Archive, ArrowRight, RefreshCw, Lightbulb } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Index,
});

const LIMIT_DISABLED = false; // Set to true to disable daily search limit
const DAILY_LIMIT = 3;
const STORAGE_KEY = "restemat_daily_usage";

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function isDevMode(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem("devMode") === "1";
}

function readUsage(): number {
  if (typeof window === "undefined") return 0;
  if (isDevMode()) return 0;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return 0;
    const parsed = JSON.parse(raw) as { date: string; count: number };
    if (parsed.date !== todayKey()) return 0;
    return parsed.count || 0;
  } catch {
    return 0;
  }
}

function writeUsage(count: number) {
  if (typeof window === "undefined") return;
  if (isDevMode()) return;
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ date: todayKey(), count }),
  );
}

function Index() {
  const [ingredients, setIngredients] = useState("");
  const [lastSubmitted, setLastSubmitted] = useState("");
  const [suggestedTitles, setSuggestedTitles] = useState<string[]>([]);
  const [usage, setUsage] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [isDev, setIsDev] = useState(false);
  const findRecipeFn = useServerFn(findRecipe);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.search.includes("reset=true")) {
      window.localStorage.removeItem(STORAGE_KEY);
      window.location.replace(window.location.pathname);
      return;
    }
    const dev = isDevMode();
    if (dev) {
      window.localStorage.removeItem(STORAGE_KEY);
    }
    setIsDev(dev);
    setUsage(readUsage());
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    const t = setTimeout(() => {
      writeUsage(0);
      setUsage(0);
    }, midnight.getTime() - now.getTime());
    return () => clearTimeout(t);
  }, [mounted]);

  const limitReached = LIMIT_DISABLED ? false : !isDev && usage >= DAILY_LIMIT;

  const mutation = useMutation<RecipeResult, Error, { ingredients: string; regenerate?: boolean; excludeTitles?: string[] }>({
    mutationFn: ({ ingredients, regenerate, excludeTitles }) => findRecipeFn({ data: { ingredients, regenerate, excludeTitles } }),
  });

  const [clientNotice, setClientNotice] = useState<string | null>(null);

  const sanitizeIngredients = (raw: string): string => {
    return raw
      .split(/[,\n;]+/)
      .map((t) => cleanIngredientName(stripWrappingBrackets(t.trim())))
      .filter((t) => t.length >= 3 && /^[a-zA-ZæøåÆØÅ0-9\s.\-'/&]+$/.test(t))
      .join(", ");
  };

  const submit = (value: string, regenerate?: boolean) => {
    const cleaned = sanitizeIngredients(value);
    if (!cleaned) {
      setClientNotice(
        "Du har lite å jobbe med — skriv inn norske matvarer du har hjemme.",
      );
      mutation.reset();
      return;
    }
    setClientNotice(null);
    if (!isDev && readUsage() >= DAILY_LIMIT) {
      setUsage(DAILY_LIMIT);
      return;
    }
    setIngredients(cleaned);
    // Reset suggestion history when starting a fresh search (not a regenerate)
    const historyForCall = regenerate ? suggestedTitles : [];
    if (!regenerate) {
      setSuggestedTitles([]);
    }
    setLastSubmitted(cleaned);
    mutation.mutate(
      { ingredients: cleaned, regenerate, excludeTitles: historyForCall },
      {
        onSuccess: (data) => {
          if (data?.name) {
            setSuggestedTitles((prev) => (prev.includes(data.name) ? prev : [...prev, data.name]));
          }
          const next = readUsage() + 1;
          writeUsage(next);
          setUsage(next);
        },
      },
    );
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };


  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submit(ingredients);
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col gap-8 px-5 py-10 sm:py-16">
      <header className="flex flex-col items-center text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20 ring-4 ring-primary/10">
          <ChefHat className="h-7 w-7" />
        </div>
        <h1 className="text-4xl font-[650] tracking-tight sm:text-5xl">Restemat</h1>
        <p className="mt-3 max-w-sm text-balance font-medium text-foreground/75">
          Fra rester til middag, helt enkelt.
        </p>
      </header>

      <form
        onSubmit={onSubmit}
        className="flex flex-col gap-3 rounded-3xl border border-border/60 bg-card p-4 shadow-md sm:p-5"
      >
        <Textarea
          value={ingredients}
          onChange={(e) => setIngredients(e.target.value)}
          placeholder="F.eks. kyllingfilet, ris, paprika, soyasaus, hvitløk, gulrot..."
          className="min-h-32 resize-none border-0 bg-transparent text-base shadow-none focus-visible:ring-0"
          disabled={mutation.isPending}
        />
        <Button
          type="submit"
          size="lg"
          disabled={mutation.isPending || !ingredients.trim() || limitReached}
          className="h-12 rounded-full text-base font-semibold"
        >
          {mutation.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Finner middag...
            </>
          ) : (
            "Finn middag"
          )}
        </Button>
      </form>
      {mounted && limitReached && (
        <div className="rounded-2xl border border-[#E8D5C4] bg-[#FDF6F0] p-6 text-center">
          <p className="text-lg font-bold text-[#8B5E3C]">Dagens søk er brukt opp</p>
          <p className="mt-1 text-sm text-[#A08060]">Lag mat av restene hver dag, uten begrensninger</p>
          <Link to="/oppgrader">
            <Button className="mt-4 h-11 rounded-full bg-[#C4785A] px-6 text-sm font-semibold text-white hover:bg-[#B06A4E]">
              Oppgrader nå →
            </Button>
          </Link>
        </div>
      )}

      {mounted && !isDev && (
        <p className="text-center text-xs text-muted-foreground">
          {Math.min(usage, DAILY_LIMIT)} av {DAILY_LIMIT} søk brukt i dag.
        </p>
      )}

      {clientNotice && (
        <div className="rounded-2xl border border-warning/30 bg-warning/10 p-4 text-sm font-medium text-warning">
          {clientNotice}
        </div>
      )}

      {mutation.isError && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {mutation.error.message || "Noe gikk galt. Prøv igjen."}
        </div>
      )}

      {mutation.data?.notFoodMessage && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {mutation.data.notFoodMessage}
        </div>
      )}

      {mutation.data && !mutation.data.notFoodMessage && (
        <>
          {mutation.data.filteredOut.length > 0 && (
            <div className="rounded-2xl border border-border bg-muted/60 p-4 text-sm font-medium text-muted-foreground">
              Vi fjernet følgende fra listen din siden det ikke er matvarer: <span className="font-medium text-foreground">{mutation.data.filteredOut.join(", ")}</span>. Oppskriften er basert på resten.
            </div>
          )}
          {mutation.data.lowIngredientNote && (
            <div className="rounded-2xl border border-warning/30 bg-warning/10 p-4 text-sm font-medium text-warning">
              {mutation.data.lowIngredientNote}
            </div>
          )}
          <RecipeCard recipe={mutation.data} />
          <div className="flex flex-col gap-4">
            {mutation.data.unusedIngredients.length > 0 && (
              <Button
                type="button"
                size="lg"
                disabled={mutation.isPending || limitReached}
                onClick={() => submit(mutation.data!.unusedIngredients.join(", "))}
                className="h-14 rounded-full bg-[#5F8364] text-base font-bold text-white shadow-lg ring-1 ring-black/5 hover:bg-[#4F7355] hover:shadow-xl"
              >
                Lag noe med restene
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )}
            {lastSubmitted && (
              <Button
                type="button"
                size="lg"
                disabled={mutation.isPending || limitReached}
                onClick={() => submit(lastSubmitted, true)}
                className="h-14 rounded-full bg-[#C4785A] text-base font-bold text-white shadow-lg ring-1 ring-black/5 hover:bg-[#B06A4E] hover:shadow-xl"
              >
                Finn en ny rett
                <RefreshCw className="ml-2 h-4 w-4" />
              </Button>
            )}
          </div>
        </>
      )}

      <InstallPrompt />
    </main>

  );
}

function RecipeCard({ recipe }: { recipe: RecipeResult }) {
  return (
    <article className="overflow-hidden rounded-3xl border border-border/60 bg-card shadow-md">
      <div className="bg-gradient-to-br from-primary/10 via-accent/10 to-transparent p-6 sm:p-7">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{recipe.name}</h2>
        <p className="mt-2 font-medium text-muted-foreground">{recipe.description}</p>
      </div>

      <div className="grid gap-6 p-6 sm:p-7">
        {recipe.haveIngredients.length > 0 && (
          <section>
            <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-success">
              <Check className="h-4 w-4" />
              Du har
            </h3>
            <ul className="flex flex-wrap gap-2">
              {recipe.haveIngredients.map((item) => (
                <li
                  key={item}
                  className="rounded-full bg-success/12 px-3 py-2 text-sm font-medium text-success"
                  style={{ backgroundColor: "color-mix(in oklab, var(--success) 14%, transparent)" }}
                >
                  {item}
                </li>
              ))}
            </ul>
          </section>
        )}

        {(recipe.unusedIngredients.length > 0 || recipe.unsafeIngredients.length > 0) && (
          <section>
            <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
              <Archive className="h-4 w-4" />
              Passer ikke til denne retten
            </h3>
            <ul className="flex flex-wrap gap-2">
              {recipe.unusedIngredients.map((item) => (
                <li
                  key={`u-${item}`}
                  className="rounded-full bg-muted px-3 py-2 text-sm font-medium text-muted-foreground"
                >
                  {item}
                </li>
              ))}
              {recipe.unsafeIngredients.map((item) => (
                <li
                  key={`s-${item}`}
                  className="rounded-full bg-muted px-3 py-2 text-sm font-medium text-muted-foreground"
                >
                  {item}
                </li>
              ))}
            </ul>
            {recipe.unusedReason && (
              <p className="mt-3 text-sm font-medium italic text-muted-foreground">
                {recipe.unusedReason}
              </p>
            )}
            {recipe.unsafeReason && (
              <p className="mt-2 text-sm font-medium italic text-muted-foreground">
                Utelatt av sikkerhetsgrunner: {recipe.unsafeReason}
              </p>
            )}
          </section>
        )}

        {recipe.missingIngredients.length > 0 && (
          <section>
            <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-warning">
              <ShoppingBasket className="h-4 w-4" />
              Du mangler
            </h3>
            <ul className="flex flex-wrap gap-2">
              {recipe.missingIngredients.map((item) => (
                <li
                  key={item}
                  className="rounded-full px-3 py-2 text-sm font-medium text-warning"
                  style={{ backgroundColor: "color-mix(in oklab, var(--warning) 18%, transparent)" }}
                >
                  {item}
                </li>
              ))}
            </ul>
          </section>
        )}

        {recipe.fullIngredients.length > 0 && (
          <section>
            <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-foreground/80">
              <UtensilsCrossed className="h-4 w-4" />
              Ingredienser
            </h3>
            <ul className="divide-y divide-border/60 rounded-2xl border border-border/60 bg-background/40">
              {recipe.fullIngredients.map((ing, i) => (
                <li key={i} className="flex items-baseline gap-3 px-4 py-2.5 text-sm">
                  <span className="min-w-20 font-medium text-foreground">
                    {[ing.amount, ing.unit].filter(Boolean).join(" ")}
                  </span>
                  <span className="font-medium text-muted-foreground">{ing.name}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {recipe.steps.length > 0 && (
          <section>
            <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-foreground/80">
              <ListOrdered className="h-4 w-4" />
              Fremgangsmåte
            </h3>
            <ol className="flex flex-col gap-3">
              {recipe.steps.map((step, i) => (
                <li key={i} className="flex gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                    {i + 1}
                  </span>
                  <p className="pt-0.5 text-sm font-medium leading-relaxed text-foreground/90">{step}</p>
                </li>
              ))}
            </ol>
          </section>
        )}

        {(recipe.sauceSuggestion || recipe.proteinSuggestion || recipe.carbSuggestion) && (
          <section className="rounded-2xl border border-border/60 bg-muted/40 p-5">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-foreground/80">
              <Lightbulb className="h-4 w-4" />
              Kan passe fint med:
            </h3>
            <ul className="flex flex-col gap-2 text-sm font-medium text-foreground/90">
              {recipe.proteinSuggestion && (
                <li className="flex gap-2">
                  <span className="font-medium text-muted-foreground">•</span>
                  <span>{recipe.proteinSuggestion}</span>
                </li>
              )}
              {recipe.carbSuggestion && (
                <li className="flex gap-2">
                  <span className="font-medium text-muted-foreground">•</span>
                  <span>{recipe.carbSuggestion}</span>
                </li>
              )}
              {recipe.sauceSuggestion && (
                <li className="flex gap-2">
                  <span className="font-medium text-muted-foreground">•</span>
                  <span>{recipe.sauceSuggestion}</span>
                </li>
              )}
            </ul>
          </section>
        )}
      </div>
    </article>
  );
}
