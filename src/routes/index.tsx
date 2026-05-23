import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { findRecipe, type RecipeResult } from "@/lib/recipe.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, ChefHat, Check, ShoppingBasket, ListOrdered, UtensilsCrossed } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const [ingredients, setIngredients] = useState("");
  const findRecipeFn = useServerFn(findRecipe);

  const mutation = useMutation<RecipeResult, Error, string>({
    mutationFn: (value: string) => findRecipeFn({ data: { ingredients: value } }),
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ingredients.trim()) return;
    mutation.mutate(ingredients.trim());
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col gap-8 px-5 py-10 sm:py-16">
      <header className="flex flex-col items-center text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
          <ChefHat className="h-7 w-7" />
        </div>
        <h1 className="text-4xl font-semibold sm:text-5xl">Restemat</h1>
        <p className="mt-3 max-w-sm text-balance text-muted-foreground">
          Skriv inn det du har hjemme – så finner vi én middag du kan lage i kveld.
        </p>
      </header>

      <form
        onSubmit={onSubmit}
        className="flex flex-col gap-3 rounded-3xl border border-border/60 bg-card p-4 shadow-sm sm:p-5"
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
          disabled={mutation.isPending || !ingredients.trim()}
          className="h-12 rounded-xl text-base font-semibold"
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

      {mutation.isError && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {mutation.error.message || "Noe gikk galt. Prøv igjen."}
        </div>
      )}

      {mutation.data && <RecipeCard recipe={mutation.data} />}
    </main>
  );
}

function RecipeCard({ recipe }: { recipe: RecipeResult }) {
  return (
    <article className="overflow-hidden rounded-3xl border border-border/60 bg-card shadow-md">
      <div className="bg-gradient-to-br from-primary/10 via-accent/10 to-transparent p-6 sm:p-7">
        <h2 className="text-2xl font-semibold sm:text-3xl">{recipe.name}</h2>
        <p className="mt-2 text-muted-foreground">{recipe.description}</p>
      </div>

      <div className="grid gap-5 p-6 sm:p-7">
        {recipe.haveIngredients.length > 0 && (
          <section>
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-success">
              <Check className="h-4 w-4" />
              Du har
            </h3>
            <ul className="flex flex-wrap gap-2">
              {recipe.haveIngredients.map((item) => (
                <li
                  key={item}
                  className="rounded-full bg-success/12 px-3 py-1.5 text-sm font-medium text-success"
                  style={{ backgroundColor: "color-mix(in oklab, var(--success) 14%, transparent)" }}
                >
                  {item}
                </li>
              ))}
            </ul>
          </section>
        )}

        {recipe.missingIngredients.length > 0 && (
          <section>
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-warning">
              <ShoppingBasket className="h-4 w-4" />
              Du mangler
            </h3>
            <ul className="flex flex-wrap gap-2">
              {recipe.missingIngredients.map((item) => (
                <li
                  key={item}
                  className="rounded-full px-3 py-1.5 text-sm font-medium text-warning"
                  style={{ backgroundColor: "color-mix(in oklab, var(--warning) 18%, transparent)" }}
                >
                  {item}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </article>
  );
}
