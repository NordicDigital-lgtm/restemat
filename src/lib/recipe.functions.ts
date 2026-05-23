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
  lowIngredientNote: string | null;
  unusedIngredients: string[];
  filteredOut: string[];
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
                `Du er en hjelpsom norsk kokk som lager enkle middagsforslag basert på det folk har hjemme. Svar alltid på norsk. Følg disse reglene:

0) FILTRERING (gjør ALLTID dette FØRST): Klassifiser hver ingrediens brukeren oppgir som enten "food" eller "not_food". Ikke-mat omfatter: rengjøringsprodukter (f.eks. Zalo, Domestos, Fairy, Jif, Klorin), hygieneprodukter (såpe, tannkrem, sjampo), emballasje, verktøy, merkevarer som ikke er mat, og fullstendig uforståelige nonsensord. Legg ALLE filtrerte elementer i feltet filtered_out (bruk brukerens egen skrivemåte). Bruk ALDRI filtrerte elementer i has_ingredients, full_ingredients, unused_ingredients eller noe annet sted i oppskriften.

1) ALLE IKKE-MAT: Hvis ALLE oppgitte elementer er ikke-mat (ingen reelle matvarer igjen etter filtrering), returner error="not_food" og message="Dette ser ikke ut som matvarer. Skriv inn det du faktisk har i kjøleskapet eller skapet."

2) SVÆRT FÅ INGREDIENSER (1–2 reelle matvarer etter filtrering): Returner en oppskrift som normalt, men legg til low_ingredient_note="Du har lite å jobbe med — her er noe enkelt du kan lage med bare et par ekstra ting."

3) ALDRI finn opp en hovedprotein eller karbohydrat brukeren ikke har. Hvis brukeren kun har krydder/tilbehør, må missing_ingredients inneholde hovedingrediensen.

4) MANGE INGREDIENSER (6 eller flere reelle matvarer etter filtrering): Velg den BESTE kombinasjonen av ingredienser for én sammenhengende rett (bruk maks 6–8 ingredienser). Legg matvarer som ikke passer til denne retten i unused_ingredients. Disse skal være ekte matvarer brukeren oppga, ikke filtrerte elementer.

Foreslå én konkret middag de kan lage i kveld med mest mulig av det de har (basert KUN på matvarene som er igjen etter filtrering). Maksimalt 2–3 manglende ingredienser. Gi ALLTID en komplett ingrediensliste med mengder og en nummerert fremgangsmåte med korte, klare steg.`,
            },
            {
              role: "user",
              content: `Jeg har dette hjemme: ${data.ingredients}\n\nForeslå én middag jeg kan lage i kveld. Returner tittel, beskrivelse, hvilke ingredienser jeg har (has_ingredients), hva jeg mangler (missing_ingredients, maks 3), full ingrediensliste med mengder (full_ingredients), fremgangsmåte (steps), og hvis jeg har 6+ matvarer: hvilke av mine ingredienser som ikke passer til denne retten (unused_ingredients).`,
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
                  unused_ingredients: {
                    type: "array",
                    items: { type: "string" },
                    description: "Matvarer brukeren har, men som ikke passer denne retten. Bruk kun når brukeren har 6+ matvarer.",
                  },
                  filtered_out: {
                    type: "array",
                    items: { type: "string" },
                    description: "Elementer fra brukerens input som er ikke-mat (rengjøring, hygiene, merkevarer som Zalo/Domestos/Fairy, nonsens). Bruk brukerens egen skrivemåte. Tom liste hvis alt er mat.",
                  },
                  low_ingredient_note: {
                    type: "string",
                    description: "Vennlig melding når brukeren har svært få ingredienser (1–2). Kun inkluder hvis relevant.",
                  },
                  error: {
                    type: "string",
                    enum: ["not_food"],
                    description: "Sett til 'not_food' hvis input ikke er matvarer. Ellers utelat.",
                  },
                  message: {
                    type: "string",
                    description: "Feilmelding når error er satt. Ellers utelat.",
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
      unused_ingredients?: string[];
      filtered_out?: string[];
      low_ingredient_note?: string;
      error?: string;
      message?: string;
    };
    if (parsed.error === "not_food") {
      throw new Error(parsed.message || "Dette ser ikke ut som matvarer. Skriv inn det du faktisk har i kjøleskapet eller skapet.");
    }
    return {
      name: parsed.title,
      description: parsed.description,
      haveIngredients: parsed.has_ingredients ?? [],
      missingIngredients: (parsed.missing_ingredients ?? []).slice(0, 3),
      fullIngredients: parsed.full_ingredients ?? [],
      steps: parsed.steps ?? [],
      lowIngredientNote: parsed.low_ingredient_note ?? null,
      unusedIngredients: parsed.unused_ingredients ?? [],
      filteredOut: parsed.filtered_out ?? [],
    };
  });
