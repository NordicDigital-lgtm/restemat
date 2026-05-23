import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const InputSchema = z.object({
  ingredients: z.string().min(1).max(2000),
});

export type FullIngredient = {
  amount: string;
  unit: string;
  name: string;
};

export type RecipeResult = {
  name: string;
  description: string;
  haveIngredients: string[];
  missingIngredients: string[];
  fullIngredients: FullIngredient[];
  steps: string[];
};

export const findRecipe = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }): Promise<RecipeResult> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY mangler");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content:
              "Du er en hjelpsom norsk kokk som lager enkle middagsforslag basert på det folk har hjemme. Svar alltid på norsk. Foreslå én konkret middag de kan lage i kveld med mest mulig av det de har. Maksimalt 2–3 manglende ingredienser. Gi ALLTID en komplett ingrediensliste med mengder (f.eks. '2 dl røde linser', '4 dl kyllingkraft') og en nummerert fremgangsmåte med korte, klare steg.",
          },
          {
            role: "user",
            content: `Jeg har dette hjemme: ${data.ingredients}\n\nForeslå én middag jeg kan lage i kveld. Returner tittel, beskrivelse, hvilke ingredienser jeg har (has_ingredients), hva jeg mangler (missing_ingredients, maks 3), full ingrediensliste med mengder (full_ingredients), og fremgangsmåte (steps).`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "foresla_middag",
              description: "Returner ett middagsforslag med full oppskrift",
              parameters: {
                type: "object",
                properties: {
                  title: { type: "string", description: "Navn på retten" },
                  description: {
                    type: "string",
                    description: "Kort, varm beskrivelse (1–2 setninger)",
                  },
                  has_ingredients: {
                    type: "array",
                    items: { type: "string" },
                    description: "Ingredienser fra brukerens liste som inngår",
                  },
                  missing_ingredients: {
                    type: "array",
                    items: { type: "string" },
                    description: "Maks 2–3 ingredienser som mangler",
                  },
                  full_ingredients: {
                    type: "array",
                    description: "Komplett ingrediensliste med mengder",
                    items: {
                      type: "object",
                      properties: {
                        amount: { type: "string", description: "Mengde, f.eks. '2', '0.5', 'en klype'" },
                        unit: { type: "string", description: "Enhet, f.eks. 'dl', 'g', 'ss', 'stk'. Kan være tom." },
                        name: { type: "string", description: "Ingrediensnavn på norsk" },
                      },
                      required: ["amount", "unit", "name"],
                      additionalProperties: false,
                    },
                  },
                  steps: {
                    type: "array",
                    items: { type: "string" },
                    description: "Fremgangsmåte som korte, klare steg på norsk",
                  },
                },
                required: [
                  "title",
                  "description",
                  "has_ingredients",
                  "missing_ingredients",
                  "full_ingredients",
                  "steps",
                ],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "foresla_middag" } },
      }),
    });

    if (!res.ok) {
      if (res.status === 429) throw new Error("For mange forespørsler – prøv igjen om litt.");
      if (res.status === 402) throw new Error("AI-kreditt er brukt opp. Legg til kreditt i Lovable-arbeidsområdet.");
      const t = await res.text();
      throw new Error(`AI-feil (${res.status}): ${t.slice(0, 200)}`);
    }

    const json = await res.json();
    const call = json.choices?.[0]?.message?.tool_calls?.[0];
    if (!call?.function?.arguments) throw new Error("Uventet svar fra AI");
    const parsed = JSON.parse(call.function.arguments) as {
      title: string;
      description: string;
      has_ingredients?: string[];
      missing_ingredients?: string[];
      full_ingredients?: FullIngredient[];
      steps?: string[];
    };
    return {
      name: parsed.title,
      description: parsed.description,
      haveIngredients: parsed.has_ingredients ?? [],
      missingIngredients: (parsed.missing_ingredients ?? []).slice(0, 3),
      fullIngredients: parsed.full_ingredients ?? [],
      steps: parsed.steps ?? [],
    };
  });
