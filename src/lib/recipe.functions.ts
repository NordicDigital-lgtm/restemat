import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const InputSchema = z.object({
  ingredients: z.string().min(1).max(2000),
});

export type RecipeResult = {
  name: string;
  description: string;
  haveIngredients: string[];
  missingIngredients: string[];
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
              "Du er en hjelpsom norsk kokk som lager enkle middagsforslag basert på det folk har hjemme. Svar alltid på norsk. Foreslå én konkret middag de kan lage i kveld med mest mulig av det de har. Maksimalt 2–3 manglende ingredienser.",
          },
          {
            role: "user",
            content: `Jeg har dette hjemme: ${data.ingredients}\n\nForeslå én middag jeg kan lage i kveld.`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "foresla_middag",
              description: "Returner ett middagsforslag",
              parameters: {
                type: "object",
                properties: {
                  name: { type: "string", description: "Navn på retten" },
                  description: {
                    type: "string",
                    description: "Kort, varm beskrivelse (1–2 setninger)",
                  },
                  haveIngredients: {
                    type: "array",
                    items: { type: "string" },
                    description: "Ingredienser fra brukerens liste som inngår",
                  },
                  missingIngredients: {
                    type: "array",
                    items: { type: "string" },
                    description: "Maks 2–3 ingredienser som mangler",
                  },
                },
                required: [
                  "name",
                  "description",
                  "haveIngredients",
                  "missingIngredients",
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
    const parsed = JSON.parse(call.function.arguments) as RecipeResult;
    return {
      name: parsed.name,
      description: parsed.description,
      haveIngredients: parsed.haveIngredients ?? [],
      missingIngredients: (parsed.missingIngredients ?? []).slice(0, 3),
    };
  });
