import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const InputSchema = z.object({
  ingredients: z.string().min(1).max(2000),
  regenerate: z.boolean().optional(),
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
  unusedReason: string | null;
  unsafeIngredients: string[];
  unsafeReason: string | null;
  filteredOut: string[];
  notFoodMessage: string | null;
};


export const findRecipe = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }): Promise<RecipeResult> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY mangler");

    // Silently strip emoji from input before processing
    const sanitizedIngredients = stripEmoji(data.ingredients).trim();
    const isSingleWord = sanitizedIngredients.length > 0 && !/[,;]/.test(sanitizedIngredients) && sanitizedIngredients.split(/\s+/).length === 1;
    if (!sanitizedIngredients) {
      return {
        name: "", description: "", haveIngredients: [], missingIngredients: [],
        fullIngredients: [], steps: [], lowIngredientNote: null,
        unusedIngredients: [], unusedReason: null, unsafeIngredients: [],
        unsafeReason: null, filteredOut: [],
        notFoodMessage: "Skriv inn det du faktisk har i kjøleskapet eller skapet.",
      };
    }

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

1) SIKKERHET (gjør ALLTID dette ETTER filtrering): Identifiser ingredienser som er giftige, helsefarlige eller krever spesialistkunnskap for trygg tilberedning. Eksempler: fugu/kuglefisk og andre fiskearter som er giftige uten ekspertbehandling, rå kassava, grønne/spirede poteter, rå rød kidneybønne, holundertbær (rå), muskatnøtt i store mengder, ville sopp uten sikker identifikasjon, plantedeler kjent for å inneholde skadelige stoffer (rabarbrablader, kirsebærsteiner, eplekjerner i mengde) osv. Slike ingredienser skal ALDRI brukes i has_ingredients, full_ingredients eller steps. Legg dem i unsafe_ingredients og sett unsafe_reason til en kort norsk forklaring (f.eks. "Fugu krever spesialistkokk – kan være dødelig uten korrekt tilberedning."). Disse skal ALDRI dukke opp i unused_ingredients.

2) ALLE IKKE-MAT: Hvis ALLE oppgitte elementer er ikke-mat (ingen reelle matvarer igjen etter filtrering), returner error="not_food" og message="Dette ser ikke ut som matvarer. Skriv inn det du faktisk har i kjøleskapet eller skapet."

3) SVÆRT FÅ INGREDIENSER (1–2 reelle matvarer etter filtrering og sikkerhet): Returner en oppskrift som normalt, men legg til low_ingredient_note="Du har lite å jobbe med — her er noe enkelt du kan lage med bare et par ekstra ting."

4) ALDRI finn opp en hovedprotein eller karbohydrat brukeren ikke har. Hvis brukeren kun har krydder/tilbehør, må missing_ingredients inneholde hovedingrediensen.

5) ÉN SAMMENHENGENDE RETT (gjelder ALLTID, uansett antall ingredienser): Velg den BESTE kombinasjonen av brukerens trygge matvarer for ÉN sammenhengende rett. Ingredienser som ikke passer — uansett grunn (matkulturkollisjon, smakskonflikt, kategorimismatch) — legges i unused_ingredients. Sett ALLTID unused_reason til én kort, vennlig norsk setning som forklarer hvorfor (f.eks. "Disse passer bedre til en asiatisk rett — prøv dem en annen kveld." eller "Disse passer bedre i en dessert."). Hvis ALT passer, la unused_ingredients være TOM og utelat unused_reason. Det finnes INGEN antallsterskel — denne logikken gjelder hver gang.

6) MEIERIPRODUKTER SOM MATLAGINGSINGREDIENSER: Når melk, fløte, kremfløte, rømme, crème fraîche, yoghurt, smør, ost eller lignende nøytrale meieriprodukter dukker opp sammen med salte/savory ingredienser, behandle dem som BRUKBARE matlagingsingredienser (sauser, gratenger, supper, stuinger, paier, bakst osv.) — IKKE som drikker som skal parkeres i unused_ingredients. Bare legg meieriprodukter i unused_ingredients hvis de virkelig kolliderer med den valgte retten (f.eks. fløte i en lett asiatisk wok der det ikke hører hjemme).

7) INGREDIENSNAVN: Skriv ingrediensnavn rent uten parenteser eller hakeparenteser rundt navnet. Ikke pakk navn inn i ( ) eller [ ] noe sted.

8) ENKELTORD-STRENG SJEKK: Hvis brukerens input består av kun ETT enkelt ord (ingen kommaer, ingen liste), må du være EKSTRA streng. Bare fortsett hvis ordet utvilsomt er en gjenkjennelig norsk matingrediens (f.eks. "egg", "pasta", "laks", "ris", "kylling", "potet", "ost", "melk", "brød", "tomat"). Hvis enkeltordet er et personnavn, et tilfeldig substantiv, et engelsk ord som ikke er et matbegrep, eller noe annet som ikke åpenbart er en matvare på norsk, returner error="not_food" og message="Dette ser ikke ut som matvarer. Skriv inn det du faktisk har i kjøleskapet eller skapet." Denne strenge sjekken gjelder KUN enkeltord-input — flerords-/kommaseparert input følger vanlig filtreringslogikk.`,
            },
            {
              role: "user",
              content: `Jeg har dette hjemme: ${sanitizedIngredients}${isSingleWord ? "\n\n(Dette er ett enkelt ord — bruk regel 8: avvis med not_food hvis det ikke utvilsomt er en norsk matingrediens.)" : ""}\n\nForeslå én middag jeg kan lage i kveld.${data.regenerate ? " Gi en helt annen rett enn forrige gang." : ""} Returner tittel, beskrivelse, hvilke ingredienser jeg har (has_ingredients), hva jeg mangler (missing_ingredients, maks 3), full ingrediensliste med mengder (full_ingredients), fremgangsmåte (steps), og hvilke av mine ingredienser som ikke passer til denne retten (unused_ingredients) med en kort forklaring (unused_reason).`,
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
                    description: "Matvarer brukeren har, men som ikke passer til den valgte retten (f.eks. fra annen matkultur eller kategori). Bruk uansett antall ingredienser. Tom liste hvis alt passer.",
                  },
                  unused_reason: {
                    type: "string",
                    description: "Kort, vennlig norsk forklaring på hvorfor unused_ingredients ikke passer, f.eks. 'Disse passer bedre til en asiatisk rett — prøv dem en annen kveld.' Utelat hvis unused_ingredients er tom.",
                  },
                  unsafe_ingredients: {
                    type: "array",
                    items: { type: "string" },
                    description: "Ingredienser som er giftige, helsefarlige eller krever spesialistkunnskap (f.eks. fugu, rå kassava, ville sopp uten sikker ID, rabarbrablader). Skal ALDRI brukes i oppskriften eller dukke opp i unused_ingredients.",
                  },
                  unsafe_reason: {
                    type: "string",
                    description: "Kort norsk forklaring på hvorfor unsafe_ingredients ble utelatt av sikkerhetsgrunner. Utelat hvis unsafe_ingredients er tom.",
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
    const message = json.choices?.[0]?.message;
    const call = message?.tool_calls?.[0];

    let raw: string | undefined = call?.function?.arguments;
    if (!raw && typeof message?.content === "string") raw = message.content;
    if (!raw) throw new Error("Uventet svar fra AI");

    const parsed = extractJson(raw) as {
      title?: string;
      description?: string;
      has_ingredients?: unknown;
      missing_ingredients?: unknown;
      full_ingredients?: unknown;
      steps?: unknown;
      unused_ingredients?: unknown;
      unused_reason?: unknown;
      unsafe_ingredients?: unknown;
      unsafe_reason?: unknown;
      filtered_out?: unknown;
      low_ingredient_note?: unknown;
      error?: string;
      message?: string;
    };

    if (parsed.error === "not_food") {
      return {
        name: "",
        description: "",
        haveIngredients: [],
        missingIngredients: [],
        fullIngredients: [],
        steps: [],
        lowIngredientNote: null,
        unusedIngredients: [],
        unusedReason: null,
        unsafeIngredients: [],
        unsafeReason: null,
        filteredOut: [],
        notFoodMessage:
          (typeof parsed.message === "string" && cleanString(parsed.message)) ||
          "Dette ser ikke ut som matvarer. Skriv inn det du faktisk har i kjøleskapet eller skapet.",
      };
    }

    const unusedIngredients = toStringArray(parsed.unused_ingredients);
    const unsafeIngredients = toStringArray(parsed.unsafe_ingredients);

    return {
      name: cleanString(parsed.title) || "Middagsforslag",
      description: cleanString(parsed.description) || "",
      haveIngredients: toStringArray(parsed.has_ingredients),
      missingIngredients: toStringArray(parsed.missing_ingredients).slice(0, 3),
      fullIngredients: toFullIngredients(parsed.full_ingredients),
      steps: toStringArray(parsed.steps),
      lowIngredientNote: cleanString(parsed.low_ingredient_note) || null,
      unusedIngredients,
      unusedReason: unusedIngredients.length > 0 ? cleanString(parsed.unused_reason) || null : null,
      unsafeIngredients,
      unsafeReason: unsafeIngredients.length > 0 ? cleanString(parsed.unsafe_reason) || null : null,
      filteredOut: toStringArray(parsed.filtered_out),
      notFoodMessage: null,
    };
  });

function extractJson(raw: string): Record<string, unknown> {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    // strip markdown fences and isolate the outermost JSON object
    let cleaned = trimmed
      .replace(/```json\s*/gi, "")
      .replace(/```\s*/g, "")
      .trim();
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      cleaned = cleaned.slice(start, end + 1);
    }
    try {
      return JSON.parse(cleaned) as Record<string, unknown>;
    } catch {
      const repaired = cleaned
        .replace(/,\s*([}\]])/g, "$1")
        .replace(/[\u0000-\u001F\u007F]/g, " ");
      return JSON.parse(repaired) as Record<string, unknown>;
    }
  }
}

function stripEmoji(value: string): string {
  // Remove emoji and pictographs silently
  return value
    .replace(/[\u{1F000}-\u{1FFFF}]/gu, "")
    .replace(/[\u{2600}-\u{27BF}]/gu, "")
    .replace(/[\u{FE00}-\u{FE0F}]/gu, "")
    .replace(/[\u{1F1E6}-\u{1F1FF}]/gu, "")
    .replace(/\p{Extended_Pictographic}/gu, "");
}

function cleanString(value: unknown): string {
  if (typeof value !== "string") return "";
  // Strip characters outside Latin scripts (e.g. CJK leakage from the model).
  // Keep Basic Latin, Latin-1 Supplement, Latin Extended-A/B, general punctuation, currency.
  return stripEmoji(value)
    .replace(/[^\u0000-\u024F\u2000-\u206F\u20A0-\u20CF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function stripWrappingBrackets(value: string): string {
  // Remove parentheses/brackets around or inside ingredient names
  return value
    .replace(/[()[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item === "string") {
      const s = stripWrappingBrackets(cleanString(item));
      if (s) out.push(s);
    } else if (item && typeof item === "object") {
      const o = item as Record<string, unknown>;
      const s = stripWrappingBrackets(cleanString(o.name ?? o.ingredient ?? o.item ?? o.value));
      if (s) out.push(s);
    }
  }
  return out;
}

function toFullIngredients(value: unknown): FullIngredient[] {
  if (!Array.isArray(value)) return [];
  const out: FullIngredient[] = [];
  for (const item of value) {
    if (item && typeof item === "object") {
      const o = item as Record<string, unknown>;
      const name = stripWrappingBrackets(cleanString(o.name));
      if (!name) continue;
      out.push({
        amount: cleanString(o.amount),
        unit: cleanString(o.unit),
        name,
      });
    } else if (typeof item === "string") {
      const s = stripWrappingBrackets(cleanString(item));
      if (s) out.push({ amount: "", unit: "", name: s });
    }
  }
  return out;
}
