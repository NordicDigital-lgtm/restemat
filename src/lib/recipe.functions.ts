import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_MODEL = "claude-haiku-4-5";



const InputSchema = z.object({
  ingredients: z.string().min(1).max(2000),
  regenerate: z.boolean().optional(),
  excludeTitles: z.array(z.string().max(200)).max(50).optional(),
  constraint: z.string().max(300).optional(),
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
  serviceMessage: string | null;
  fallback: boolean;
  proteinSuggestion: string | null;
  carbSuggestion: string | null;
  sauceSuggestion: string | null;
  timeEstimateMin: number | null;
  worstFittingHave: string | null;
  bestFittingUnused: string | null;
};

const MAX_GENERATION_ATTEMPTS = 3;
const RETRYABLE_STATUS_CODES = new Set([429, 503, 504]);


export const findRecipe = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }): Promise<RecipeResult> => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    console.log("ANTHROPIC_API_KEY exists:", !!apiKey);
    console.log("Using model:", ANTHROPIC_MODEL);
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY mangler.");


    // Silently strip emoji from input before processing
    const sanitizedIngredients = stripEmoji(data.ingredients).trim();
    const isSingleWord = sanitizedIngredients.length > 0 && !/[,;]/.test(sanitizedIngredients) && sanitizedIngredients.split(/\s+/).length === 1;
    if (!sanitizedIngredients) {
      return createEmptyRecipeResult({
        notFoodMessage: "Skriv inn det du faktisk har i kjøleskapet eller skapet.",
      });
    }

const systemPrompt = `Du er en hjelpsom norsk kokk. Du lager middagsforslag basert på det brukeren har hjemme, og svarer alltid på norsk bokmål.

FILTRERING (gjør først):

Fjern ikke-mat fra input: rengjøringsmidler, hygieneprodukter, merker som ikke er mat, nonsensord. Legg disse i filtered_out med brukerens skrivemåte. Bruk dem aldri i has_ingredients eller andre felter.

SIKKERHET:

Ingredienser som er giftige eller krever spesialistkunnskap (rå kassava, grønne poteter, rå kidneybønner, ville sopp, fugu, rabarbrablader osv.) skal aldri brukes. Legg dem i unsafe_ingredients med kort norsk forklaring i unsafe_reason.

SPESIALTILFELLER:

- Hvis alt er ikke-mat: returner error="not_food" og en hjelpsom melding.

- Hvis input er ett enkelt ord som ikke utvilsomt er en norsk matingrediens (f.eks. personnavn, engelsk slangord): returner error="not_food".

- Hvis 1-2 reelle matvarer: lag oppskriften, men sett low_ingredient_note="Du har lite å jobbe med — her er noe enkelt du kan lage med bare et par ekstra ting."

- Hvis brukeren bare har krydder/tilbehør: hovedprotein og karbohydrat må stå i missing_ingredients.

INGREDIENSKATEGORISERING (kritisk):

Hver ingrediens fra input (etter filtrering) MÅ havne i nøyaktig én av:

- has_ingredients: brukt i retten

- unused_ingredients: i input men passer ikke til denne retten (med unused_reason som forklarer kort og vennlig)

Telling: has_ingredients.length + unused_ingredients.length = antall reelle matvarer i input. Ingen ingrediens får forsvinne.

OPPSKRIFTSDESIGN:

Lag ÉN sammenhengende rett som bruker flest mulig av brukerens ingredienser. Stivelsesholdige grønnsaker (poteter, søtpoteter osv.) er hovedingredienser, ikke tilbehør. Meieriprodukter (fløte, yoghurt, ost) er matlagingsingredienser, ikke drikker. Flytt kun til unused_ingredients hvis ingrediensen genuint kolliderer med retten (kulturkollisjon, smakskonflikt).

Rett opp åpenbare skrivefeil ("egf" → "egg", "kyling" → "kylling") og bruk den rettede skrivemåten konsekvent.

INGREDIENSNAVN:

Alltid rene navn uten kvalifikatorer, parenteser, suffikser eller engelske ord. "blåbær" ikke "blåbær (frosne)". "egg" ikke "fresh egg".

FREMGANGSMÅTE - SLIK SKAL STEGENE SKRIVES:

Hvert steg er en komplett setning som starter med imperativverb, nevner ingrediensen, og forklarer hvordan eller til hvilket resultat. Stegene skal lese som en hel oppskrift, ikke som stikkord.

Alle ingredienser i has_ingredients skal nevnes ved navn i minst ett steg.

Bruk smør, nøytral olje eller rapsolje til steking — aldri olivenolje.

Eksempel på hvordan en komplett fremgangsmåte ser ut, gitt ingrediensene løk, hvitløk, kylling, paprika, ris, kokosmelk, spinat, chili, ingefær:

1. Kok risen i lettsaltet vann etter anvisningen på pakken til den er mør og luftig.

2. Mens risen koker, finhakk løk og hvitløk og stek dem i en stor panne med smør til løken er blank og myk.

3. Skjær kyllingen i terninger og brun den sammen med løken til kjøttet er gjennomstekt og har fått fin farge.

4. Riv ingefær og finhakk chili, og rør det inn i pannen sammen med paprika kuttet i strimler.

5. Hell over kokosmelken og la sausen småkoke i 5-7 minutter til den tykner og smakene blander seg.

6. Rør inn fersk spinat helt til slutt og la den falle sammen i den varme sausen før du smaker til med salt og pepper.

7. Server kyllingen med risen ved siden av eller bland alt sammen i én bolle.

Skriv stegene i samme stil som over: fullstendige instruksjoner som beskriver handling + ingrediens + metode/resultat.

KAN PASSE FINT MED:

Sett carb_suggestion, protein_suggestion og sauce_suggestion bare når de tilfører verdi. Ellers null.

- Protein: aldri foreslå hvis input allerede har protein (kjøtt, fisk, egg, belgvekster).

- Karbohydrat: foreslå når retten mangler en. Velg tilberedningsmetode som passer (stekte poteter til omelett, kokte til fisk).

- Saus: bare når retten ikke allerede har en.

- Aldri foreslå noe brukeren allerede har i input.

- Aldri forklar hvorfor du IKKE foreslår noe. Utelat det stille.

`;

    const userPrompt = `Jeg har dette hjemme: ${sanitizedIngredients}${isSingleWord ? "\n\n(Dette er ett enkelt ord — bruk regel 8: avvis med not_food hvis det ikke utvilsomt er en norsk matingrediens.)" : ""}\n\nForeslå én middag jeg kan lage i kveld.${data.regenerate ? " Gi en helt annen rett enn forrige gang." : ""}${data.excludeTitles && data.excludeTitles.length > 0 ? `\n\nDo not suggest any of these dishes: ${data.excludeTitles.join(", ")}. Velg en helt annen rett som ikke er en variasjon av disse.` : ""}${data.constraint ? `\n\nEkstra krav: ${data.constraint}` : ""} Returner tittel, beskrivelse, hvilke ingredienser jeg har (has_ingredients), hva jeg mangler (missing_ingredients, maks 3), full ingrediensliste med mengder (full_ingredients), fremgangsmåte (steps), og hvilke av mine ingredienser som ikke passer til denne retten (unused_ingredients) med forklaring (unused_reason).\n\nKRAV TIL FREMGANGSMÅTE - les nøye:\n\nHvert steg må starte med et handlingsverb og beskrive hva som gjøres med hvilken ingrediens, og hva resultatet skal være.\n\nEksempel: "Finhakk løk og hvitløk og stek i smør til løken er blank" - ikke bare "Finhakk løk".\n\nFør du returnerer: gå gjennom has_ingredients én for én og sjekk at hvert ingrediensnavn er nevnt i minst ett steg. Hvis ikke - legg til et steg eller flett ingrediensen inn i et eksisterende steg. Ingen ingrediens i has_ingredients får mangle fra fremgangsmåten.\n\nInkluder også: estimat på tilberedningstid i minutter (time_estimate_min), ingrediensen i has_ingredients som passer dårligst til retten (worst_fitting_have), og ingrediensen i unused_ingredients som lettest kunne passet inn i en variant (best_fitting_unused).`;

    const toolParameters = {
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
          description:
            "Ingredienser brukeren har som brukes i retten (kun rene navn)",
        },
        missing_ingredients: {
          type: "array",
          items: { type: "string" },
          description:
            "Ingredienser brukeren mangler (maks 3). Kun rene navn.",
        },
        full_ingredients: {
          type: "array",
          items: {
            type: "object",
            properties: {
              amount: { type: "string", description: "Mengde, f.eks. 400" },
              unit: { type: "string", description: "Enhet, f.eks. g, dl, stk" },
              name: { type: "string", description: "Ingrediensnavn" },
            },
            required: ["amount", "unit", "name"],
          },
          description: "Full ingrediensliste med mengder og enheter",
        },
        steps: {
          type: "array",
          items: { type: "string" },
          description:
            "Fremgangsmåte som fullstendige instruksjoner. Hvert steg starter med imperativverb og nevner ingrediens + handling + resultat. Alle ingredienser fra has_ingredients MÅ nevnes i minst ett steg.",
        },
        low_ingredient_note: {
          type: "string",
          description:
            'Hvis brukeren har svært få ingredienser (1–2), inkluder en kort melding som "Du har lite å jobbe med — her er noe enkelt du kan lage med bare et par ekstra ting." Ellers null.',
        },
        unused_ingredients: {
          type: "array",
          items: { type: "string" },
          description:
            "Ingredienser brukeren har som ikke passer til denne retten. VIKTIG: Returner KUN det rene ingrediensnavnet - aldri legg til suffikser, identifiers eller tilleggstekst. Eksempler på RIKTIG format: 'soyasaus', 'ingefær', 'kanel', 'rosenkål'. ALDRI: 'soyasausHeader', 'ingefærHeader', 'kanelHeader', 'soyasaus (ikke brukt)', 'ingefær-unused'.",
        },
        unused_reason: {
          type: "string",
          description:
            "Én kort, vennlig norsk setning som forklarer hvorfor unused_ingredients ikke brukes. Utelat hvis ingen unused_ingredients.",
        },
        unsafe_ingredients: {
          type: "array",
          items: { type: "string" },
          description:
            "Ingredienser som er giftige/helsefarlige eller krever spesialistkunnskap",
        },
        unsafe_reason: {
          type: "string",
          description:
            "Kort forklaring på hvorfor unsafe_ingredients ikke brukes. Utelat hvis ingen unsafe_ingredients.",
        },
        filtered_out: {
          type: "array",
          items: { type: "string" },
          description:
            "Ikke-matvarer som ble filtrert bort (rengjøring, hygieneartikler, nonsens). Bruk brukerens egen skrivemåte.",
        },
        error: {
          type: "string",
          description:
            'Feilkode hvis brukerens input er ugyldig. Eneste tillatte verdi er "not_food".',
        },
        message: {
          type: "string",
          description:
            'Kun brukt ved error="not_food". Gi en vennlig melding som "Dette ser ikke ut som matvarer. Skriv inn det du faktisk har i kjøleskapet eller skapet."',
        },
        protein_suggestion: {
          type: "string",
          description:
            "Ett kort forslag til protein (f.eks. 'Kyllingfilet eller laks') bare hvis retten mangler protein og brukeren ikke allerede har protein. Ellers null.",
        },
        carb_suggestion: {
          type: "string",
          description:
            "Ett kort forslag til karbohydrat (f.eks. 'Kokt ris eller ovnsbakte poteter') bare hvis retten mangler karbohydrat. Ellers null.",
        },
        sauce_suggestion: {
          type: "string",
          description:
            "Ett kort forslag til saus (f.eks. 'En enkel pannesaus laget av stekesjyen') bare hvis retten mangler saus. Ellers null.",
        },
        time_estimate_min: {
          type: "number",
          description:
            "Estimert total tilberedningstid i minutter (kun et heltall, f.eks. 25). Ta med både forberedelse og koking.",
        },
        worst_fitting_have: {
          type: "string",
          description:
            "Navnet på den ENE ingrediensen fra has_ingredients som passer dårligst med resten av retten — den som lettest kunne vært utelatt. Returner kun det rene ingrediensnavnet. Hvis alt passer perfekt, returner tom streng.",
        },
        best_fitting_unused: {
          type: "string",
          description:
            "Navnet på den ENE ingrediensen fra unused_ingredients som har høyest sannsynlighet for å passe inn i en variant av retten. Returner kun det rene ingrediensnavnet. Hvis unused_ingredients er tom, returner tom streng.",
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
    } as Record<string, unknown>;

    let rawArgs: Record<string, unknown> | null = null;
    try {
      rawArgs = await generateContentWithRetry(
        () => callLovableGateway(apiKey, systemPrompt, userPrompt, toolParameters),
        MAX_GENERATION_ATTEMPTS,
      );
    } catch (gatewayError) {
      console.error("Lovable AI gateway failed", gatewayError);
      return createEmptyRecipeResult({
        serviceMessage: getRecipeGenerationErrorMessage(gatewayError),
        fallback: true,
      });
    }


    if (!rawArgs) {
      return createEmptyRecipeResult({
        serviceMessage: "Kunne ikke lage oppskrift akkurat nå. Prøv igjen.",
        fallback: true,
      });
    }

    const raw = rawArgs;


    // Handle error response
    if (raw.error === "not_food" && typeof raw.message === "string") {
      return createEmptyRecipeResult({
        notFoodMessage: cleanString(raw.message),
      });
    }

    // Parse successful recipe response
    const title = cleanString(raw.title);
    const description = cleanString(raw.description);
    const stripSuffix = (str: string) =>
      str
        .replace(/(Header|neighborhood)\s*(g|ts|stk|dl|ss|fedd|potte)?$/i, "")
        .replace(/(luxury|health|village|organic|fresh|premium|Cerferf)$/i, "")
        .trim();
    const haveIngredients = toStringArray(raw.has_ingredients).map(stripSuffix);
    const missingIngredients = toStringArray(raw.missing_ingredients).map(stripSuffix);
    const fullIngredients = toFullIngredients(raw.full_ingredients).map((fi) => ({
      amount: fi.amount.replace(/Header.*$/i, "").trim(),
      unit: fi.unit.replace(/Header.*$/i, "").trim(),
      name: stripSuffix(fi.name),
    }));
    const steps = toStringArray(raw.steps);
    const lowIngredientNote = raw.low_ingredient_note
      ? cleanString(raw.low_ingredient_note)
      : null;
    const unusedIngredients = toStringArray(raw.unused_ingredients).map(stripSuffix);
    const unusedReason = raw.unused_reason
      ? cleanString(raw.unused_reason)
      : null;
    const unsafeIngredients = toStringArray(raw.unsafe_ingredients);
    const unsafeReason = raw.unsafe_reason
      ? cleanString(raw.unsafe_reason)
      : null;
    const filteredOut = toStringArray(raw.filtered_out);
    const proteinSuggestion = raw.protein_suggestion
      ? cleanString(raw.protein_suggestion)
      : null;
    const carbSuggestion = raw.carb_suggestion
      ? cleanString(raw.carb_suggestion)
      : null;
    const sauceSuggestion = raw.sauce_suggestion
      ? cleanString(raw.sauce_suggestion)
      : null;
    const timeEstimateMin =
      typeof raw.time_estimate_min === "number"
        ? Math.round(raw.time_estimate_min)
        : typeof raw.time_estimate_min === "string" && /^\d+$/.test(raw.time_estimate_min.trim())
          ? Number(raw.time_estimate_min.trim())
          : null;
    const worstFittingHave = raw.worst_fitting_have
      ? stripSuffix(cleanIngredientName(stripWrappingBrackets(cleanString(raw.worst_fitting_have))))
      : null;
    const bestFittingUnused = raw.best_fitting_unused
      ? stripSuffix(cleanIngredientName(stripWrappingBrackets(cleanString(raw.best_fitting_unused))))
      : null;

    return {
      name: title,
      description,
      haveIngredients,
      missingIngredients,
      fullIngredients,
      steps,
      lowIngredientNote,
      unusedIngredients,
      unusedReason,
      unsafeIngredients,
      unsafeReason,
      filteredOut,
      notFoodMessage: null,
      serviceMessage: null,
      fallback: false,
      proteinSuggestion,
      carbSuggestion,
      sauceSuggestion,
      timeEstimateMin,
      worstFittingHave: worstFittingHave || null,
      bestFittingUnused: bestFittingUnused || null,
    };
  });

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

export function stripWrappingBrackets(value: string): string {
  // Remove parenthetical/bracketed content entirely (e.g. "salt (havsalt)" -> "salt"),
  // then strip any remaining stray brackets and trim leading/trailing punctuation.
  return value
    .replace(/\s*[(\[{][^)\]}]*[)\]}]\s*/g, " ")
    .replace(/[()[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s,;.:!?\-–—]+|[\s,;.:!?\-–—]+$/g, "")
    .trim();
}

// Words that sometimes leak in from category labels, metadata, or model artifacts.
// Stripped whenever they appear as trailing/leading tokens on an ingredient name.
const NON_INGREDIENT_TOKENS = new Set([
  "stories", "story", "garden", "village", "villages", "category", "categories",
  "tag", "tags", "label", "labels", "ingredient", "ingredients",
  "metadata", "meta", "info", "note", "notes", "type", "types",
  "group", "groups", "section", "sections", "item", "items",
  "list", "lists", "recipe", "recipes", "food", "foods",
  "collection", "collections", "page", "pages",
]);

export function cleanIngredientName(value: string): string {
  if (!value) return "";
  // Cut off anything after a separator (comma, semicolon, colon, slash, pipe,
  // or a dash surrounded by spaces) — explanations / category labels follow these.
  let s = value.split(/\s*[,;:/|]\s*|\s+[-–—]\s+/)[0] ?? value;
  s = s.replace(/\s+/g, " ").trim();
  // Aggressive suffix sweep: strip known metadata words (run repeatedly to
  // catch chained suffixes like "blåbær village stories").
  const SUFFIX_RE = /\s+(village|villages|stories|story|category|categories|ingredient|ingredients|items|item|products|product|recipes|recipe|tags|tag|labels|label|collection|collections|pages|page|foods|food)$/i;
  while (SUFFIX_RE.test(s)) {
    s = s.replace(SUFFIX_RE, "").trim();
  }
  // Strip leading/trailing non-ingredient tokens repeatedly.
  let changed = true;
  while (changed) {
    changed = false;
    const tokens = s.split(/\s+/).filter(Boolean);
    if (tokens.length > 1 && NON_INGREDIENT_TOKENS.has(tokens[tokens.length - 1].toLowerCase())) {
      tokens.pop();
      s = tokens.join(" ");
      changed = true;
      continue;
    }
    if (tokens.length > 1 && NON_INGREDIENT_TOKENS.has(tokens[0].toLowerCase())) {
      tokens.shift();
      s = tokens.join(" ");
      changed = true;
    }
  }
  return s.replace(/^[\s,;.:!?\-–—]+|[\s,;.:!?\-–—]+$/g, "").trim();
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item === "string") {
      const s = cleanIngredientName(stripWrappingBrackets(cleanString(item)));
      if (s) out.push(s);
    } else if (item && typeof item === "object") {
      const o = item as Record<string, unknown>;
      const s = cleanIngredientName(stripWrappingBrackets(cleanString(o.name ?? o.ingredient ?? o.item ?? o.value)));
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
      const name = cleanIngredientName(stripWrappingBrackets(cleanString(o.name)));
      if (!name) continue;
      out.push({
        amount: cleanString(o.amount),
        unit: cleanString(o.unit),
        name,
      });
    } else if (typeof item === "string") {
      const s = cleanIngredientName(stripWrappingBrackets(cleanString(item)));
      if (s) out.push({ amount: "", unit: "", name: s });
    }
  }
  return out;
}

function getRecipeGenerationErrorMessage(error: unknown): string {
  const providerError = error as { status?: number; message?: string };
  const status = extractProviderStatus(error);
  const message = (providerError?.message ?? "").toLowerCase();

  if (status === 404) {
    return "AI-modellen er midlertidig utilgjengelig. Prøv igjen om litt.";
  }

  if (status === 429 || status === 503 || status === 504) {
    return "Tjenesten er midlertidig opptatt akkurat nå. Prøv igjen om litt.";
  }

  if (status === 401 || status === 403) {
    return "AI-tjenesten er ikke riktig konfigurert akkurat nå.";
  }

  if (
    message.includes("quota") ||
    message.includes("high demand") ||
    message.includes("service unavailable") ||
    message.includes("try again later")
  ) {
    return "Tjenesten er midlertidig opptatt akkurat nå. Prøv igjen om litt.";
  }

  return "Kunne ikke lage oppskrift akkurat nå. Prøv igjen.";
}

function extractProviderStatus(error: unknown): number | null {
  const providerError = error as { status?: number; message?: string };
  if (typeof providerError?.status === "number") {
    return providerError.status;
  }

  const message = providerError?.message ?? "";
  const match = message.match(/\[(\d{3})[^\]]*\]/) ?? message.match(/\b(401|403|404|429|500|502|503|504)\b/);
  return match ? Number(match[1]) : null;
}

function isRetryableGenerationError(error: unknown): boolean {
  const status = extractProviderStatus(error);
  const message = ((error as { message?: string } | null)?.message ?? "").toLowerCase();

  return (
    (status !== null && RETRYABLE_STATUS_CODES.has(status)) ||
    message.includes("high demand") ||
    message.includes("service unavailable") ||
    message.includes("try again later") ||
    message.includes("retry")
  );
}

async function generateContentWithRetry<T>(
  run: () => Promise<T>,
  maxAttempts: number,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      lastError = error;
      if (!isRetryableGenerationError(error) || attempt === maxAttempts) {
        throw error;
      }

      const delayMs = 700 * 2 ** (attempt - 1);
      console.warn(`Gemini retry ${attempt}/${maxAttempts} after ${delayMs}ms`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError;
}

async function callLovableGateway(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  toolParameters: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 2000,
      system: systemPrompt,
      messages: [
        { role: "user", content: userPrompt },
      ],
      tools: [
        {
          name: "foresla_middag",
          description: "Returner ett middagsforslag med full oppskrift",
          input_schema: toolParameters,
        },
      ],
      tool_choice: { type: "tool", name: "foresla_middag" },
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    const err = new Error(`Anthropic API ${response.status}: ${text}`) as Error & { status?: number };
    err.status = response.status;
    throw err;
  }

  const json = (await response.json()) as {
    content?: Array<{ type?: string; name?: string; input?: unknown }>;
  };

  const toolUseBlock = json.content?.find((b) => b.type === "tool_use");
  if (!toolUseBlock || toolUseBlock.name !== "foresla_middag" || !toolUseBlock.input) {
    throw new Error("Anthropic API returned no tool_use block");
  }

  return toolUseBlock.input as Record<string, unknown>;
}



function createEmptyRecipeResult(
  overrides: Partial<RecipeResult> = {},
): RecipeResult {
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
    notFoodMessage: null,
    serviceMessage: null,
    fallback: false,
    proteinSuggestion: null,
    carbSuggestion: null,
    sauceSuggestion: null,
    timeEstimateMin: null,
    worstFittingHave: null,
    bestFittingUnused: null,
    ...overrides,
  };
}
