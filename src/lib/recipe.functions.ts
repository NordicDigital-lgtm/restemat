import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const LOVABLE_AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const LOVABLE_MODEL = "google/gemini-2.5-flash";



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
    const apiKey = process.env.LOVABLE_API_KEY;
    console.log("LOVABLE_API_KEY exists:", !!apiKey);
    console.log("Using model:", LOVABLE_MODEL);
    if (!apiKey) throw new Error("AI-kreditt er brukt opp. Legg til kreditt i Lovable-arbeidsområdet.");


    // Silently strip emoji from input before processing
    const sanitizedIngredients = stripEmoji(data.ingredients).trim();
    const isSingleWord = sanitizedIngredients.length > 0 && !/[,;]/.test(sanitizedIngredients) && sanitizedIngredients.split(/\s+/).length === 1;
    if (!sanitizedIngredients) {
      return createEmptyRecipeResult({
        notFoodMessage: "Skriv inn det du faktisk har i kjøleskapet eller skapet.",
      });
    }

    const systemPrompt = `Du er en hjelpsom norsk kokk som lager enkle middagsforslag basert på det folk har hjemme. Svar alltid på norsk. Følg disse reglene:

INGREDIENS-NAVNGIVNING (ALLER HØYESTE PRIORITET):
Alle ingrediensnavn returneres som rene, enkle ord uten tillegg.
Korrekt formatering:
- blåbær
- soyasaus
- rosenkål
- egg
Ingrediensnavn inneholder ALDRI kvalifikatorer, engelske ord, suffiks, prefikser eller forklaringer (ikke "blåbær village", ikke "fresh egg", ikke "egg (stort)").
I has_ingredients, missing_ingredients og unused_ingredients: Bruk KUN det faktiske ingrediensnavnet.

SKRIVEFEIL-HÅNDTERING:
Hvis brukeren skriver en åpenbar skrivefeil (f.eks. "egf" i stedet for "egg", "kyling" i stedet for "kylling"):
- Rett opp til korrekt norsk stavemåte
- Returner det RETTEDE navnet i has_ingredients (f.eks. "egg", IKKE "egf")
- Bruk det rettede navnet konsekvent i oppskriften og fremgangsmåten
Eksempel: Input "ris, kylling, egf" → has_ingredients: ["ris", "kylling", "egg"]

HOVEDREGEL - MAKSIMER INGREDIENSBRUK: Din primære oppgave er å lage ÉN sammenhengende rett som bruker FLEST MULIG av brukerens ingredienser.

HIERARKI:
1. FØRST: Kan jeg lage en god rett med ALLE ingrediensene? → gjør det
2. HVIS NEI: Kan jeg lage en god rett med de fleste (80%+)? → gjør det, resten til unused_ingredients
3. KUN HVIS kvaliteten ville bli dårlig: reduser antall ingredienser

EKSEMPLER:
- Input: blåbær, bringebær, aprikos → IKKE lag en rett med bare aprikos → LAG en frukt-smoothie, kompott, eller sommerdessert som bruker ALLE
- Input: tomat, mozzarella, basilikum, laks → IKKE ignorer laksen → LAG en laks-caprese-salat eller ovnsbakt laks med tomat/mozzarella

unused_ingredients skal kun brukes når ingredienser faktisk KOLLIDERER (f.eks. fersk fisk + melkeprodukter i varme retter, eller kulturkollisjoner).

Hvis en ingrediens 'nesten passer': legg den i 'Kan passe fint med' (carb_suggestion, protein_suggestion, sauce_suggestion) i stedet for unused_ingredients.


ABSOLUTT KRAV - KATEGORISERING: Hver eneste ingrediens som brukeren oppga (etter filtrering av ikke-mat og sikkerhet) MÅ plasseres i nøyaktig én av tre kategorier i responsen:
- has_ingredients (brukt i retten)
- missing_ingredients (mangler men trengs - kun for ingredienser IKKE i input)
- unused_ingredients (i input men passer ikke retten)

Det skal være UMULIG at en ingrediens fra brukerens input forsvinner fra responsen. Tell ingrediensene før og etter: hvis brukeren oppga 15 reelle matvarer, MÅ has_ingredients.length + unused_ingredients.length = 15 (missing_ingredients teller ikke siden de IKKE er i input; filtered_out og unsafe_ingredients teller heller ikke siden de er fjernet av regler 0 og 1).

Hvis en ingrediens kunne passet i retten men ikke ble valgt, plasser den i unused_ingredients med forklaring i unused_reason. Aldri la en input-ingrediens forsvinne uten å stå i én av disse listene.

0) FILTRERING (gjør ALLTID dette FØRST): Klassifiser hver ingrediens brukeren oppgir som enten "food" eller "not_food". Ikke-mat omfatter: rengjøringsprodukter (f.eks. Zalo, Domestos, Fairy, Jif, Klorin), hygieneprodukter (såpe, tannkrem, sjampo), emballasje, verktøy, merkevarer som ikke er mat, og fullstendig uforståelige nonsensord. Legg ALLE filtrerte elementer i feltet filtered_out (bruk brukerens egen skrivemåte). Bruk ALDRI filtrerte elementer i has_ingredients, full_ingredients, unused_ingredients eller noe annet sted i oppskriften.

1) SIKKERHET (gjør ALLTID dette ETTER filtrering): Identifiser ingredienser som er giftige, helsefarlige eller krever spesialistkunnskap for trygg tilberedning. Eksempler: fugu/kuglefisk og andre fiskearter som er giftige uten ekspertbehandling, rå kassava, grønne/spirede poteter, rå rød kidneybønne, holundertbær (rå), muskatnøtt i store mengder, ville sopp uten sikker identifikasjon, plantedeler kjent for å inneholde skadelige stoffer (rabarbrablader, kirsebærsteiner, eplekjerner i mengde) osv. Slike ingredienser skal ALDRI brukes i has_ingredients, full_ingredients eller steps. Legg dem i unsafe_ingredients og sett unsafe_reason til en kort norsk forklaring (f.eks. "Fugu krever spesialistkokk – kan være dødelig uten korrekt tilberedning."). Disse skal ALDRI dukke opp i unused_ingredients.

2) ALLE IKKE-MAT: Hvis ALLE oppgitte elementer er ikke-mat (ingen reelle matvarer igjen etter filtrering), returner error="not_food" og message="Dette ser ikke ut som matvarer. Skriv inn det du faktisk har i kjøleskapet eller skapet."

3) SVÆRT FÅ INGREDIENSER (1–2 reelle matvarer etter filtrering og sikkerhet): Returner en oppskrift som normalt, men legg til low_ingredient_note="Du har lite å jobbe med — her er noe enkelt du kan lage med bare et par ekstra ting."

4) ALDRI finn opp en hovedprotein eller karbohydrat brukeren ikke har. Hvis brukeren kun har krydder/tilbehør, må missing_ingredients inneholde hovedingrediensen.

5) ÉN SAMMENHENGENDE RETT (gjelder ALLTID, uansett antall ingredienser): Velg den BESTE kombinasjonen av brukerens trygge matvarer for ÉN sammenhengende rett. BRUK ALLTID så mange av brukerens ingredienser som mulig i selve oppskriften — ingen ingrediens skal stå ubrukt hvis den med rimelighet kan passe inn i retten. Stivelsesholdige grønnsaker (poteter, søtpoteter, pastinakk, sellerirot osv.) skal behandles som HOVEDINGREDIENSER og brukes i selve retten — ALDRI parker poteter i unused_ingredients eller foreslå dem i "Kan passe fint med:" når brukeren faktisk har dem. Flytt KUN en ingrediens til unused_ingredients hvis den genuint kolliderer med retten (matkulturkollisjon, smakskonflikt, kategorimismatch). Ikke parker ingredienser der bare fordi oppskriften allerede har en karbohydratkilde — bygg heller retten rundt det brukeren faktisk har. Sett ALLTID unused_reason til én kort, vennlig norsk setning som forklarer hvorfor (f.eks. "Disse passer bedre til en asiatisk rett — prøv dem en annen kveld."). Hvis ALT passer, la unused_ingredients være TOM og utelat unused_reason.

5b) RENE INGREDIENSNAVN I unused_ingredients: Når du lister ingredienser i unused_ingredients, skriv KUN det rene navnet akkurat slik brukeren skrev det — ingen tilleggstekst, kategorimerkelapper eller suffikser som "(meieriprodukt)", "(ikke brukt)" eller lignende. Forklaringer hører hjemme i unused_reason, ikke i ingrediensnavnet.

6) MEIERIPRODUKTER SOM MATLAGINGSINGREDIENSER: Når melk, fløte, kremfløte, rømme, crème fraîche, yoghurt, smør, ost eller lignende nøytrale meieriprodukter dukker opp sammen med salte/savory ingredienser, behandle dem som BRUKBARE matlagingsingredienser (sauser, gratenger, supper, stuinger, paier, bakst osv.) — IKKE som drikker som skal parkeres i unused_ingredients. Bare legg meieriprodukter i unused_ingredients hvis de virkelig kolliderer med den valgte retten (f.eks. fløte i en lett asiatisk wok der det ikke hører hjemme).

7) INGREDIENSNAVN: Skriv ingrediensnavn rent uten parenteser eller hakeparenteser rundt navnet, og uten forklaringer i parentes. Ikke pakk navn inn i ( ) eller [ ] noe sted, og ikke legg til tolkninger som "(antagelig X)" eller lignende — bare skriv det rene ingrediensnavnet du har valgt.

9) NORSK BOKMÅL: Alle oppskriftstitler, beskrivelser og fremgangsmåter skal skrives på korrekt norsk bokmål. Vær spesielt nøye med adjektivbøyning (kremet/kremete, stekt/stekte), bestemte og ubestemte artikkelformer, og verbbøyning. Bruk naturlig norsk språk slik en morsmålsbruker ville skrevet det i en oppskriftskontekst.

8) ENKELTORD-STRENG SJEKK: Hvis brukerens input består av kun ETT enkelt ord (ingen kommaer, ingen liste), må du være EKSTRA streng. Bare fortsett hvis ordet utvilsomt er en gjenkjennelig norsk matingrediens (f.eks. "egg", "pasta", "laks", "ris", "kylling", "potet", "ost", "melk", "brød", "tomat"). Hvis enkeltordet er et personnavn, et tilfeldig substantiv, et engelsk ord som ikke er et matbegrep, eller noe annet som ikke åpenbart er en matvare på norsk, returner error="not_food" og message="Dette ser ikke ut som matvarer. Skriv inn det du faktisk har i kjøleskapet eller skapet." Denne strenge sjekken gjelder KUN enkeltord-input — flerords-/kommaseparert input følger vanlig filtreringslogikk.

10) KAN PASSE FINT MED: Etter oppskriften, legg til en kort seksjon med tittelen "Kan passe fint med:" — men bare når det faktisk tilfører verdi.

REGEL-REKKEFØLGE (viktigst først):
- PROTEIN: ALDRI foreslå protein hvis brukerens input allerede inneholder protein (kjøtt, fisk, fjørfe, egg, belgvekster/linser/bønner). Dette er den høyest prioriterte regelen.
- KARBOHYDRAT: ALLTID foreslå karbohydrat når oppskriften ikke inneholder noe karbohydrat — inkludert curry, gryterett, og sausbaserte retter der ris, naan eller flatbrød ville vært naturlig. Ikke hopp over denne bare fordi retten har en saus.
- SAUS: Foreslå saus bare hvis oppskriften ikke inneholder saus, dressing, sjy eller pannesaus fra før.

STEG-REGLER (HØYESTE PRIORITET):
- Hvert steg 15-20 ord - kortere enn 15 er for lite, lengre enn 20 blir ordrik fyllmasse
- Skriv på naturlig norsk bokmål - ALDRI oversett fra engelsk
- Inkluder handling, metode og resultat i én setning
- Bruk ALDRI olivenolje til steking - bruk "smør", "nøytral olje" eller "rapsolje"
- Unngå unaturlige uttrykk som "avgir god duft", "avgir smak" - skriv direkte hva som skjer

GODE EKSEMPLER (følg denne stilen):
✓ "Skrell og skjær potetene i terninger på ca 2 cm, skyll dem under kaldt vann og la dem renne av"
✓ "Stek kyllingen i smør på middels varme til den har fått fin farge på begge sider og er gjennomstekt"
✓ "Finhakk hvitløk og løk og stek dem i smør til løken er blank og myk uten å få farge"

DÅRLIGE EKSEMPLER (aldri skriv slik):
✗ "Bland sammen soyasaus" (for kort, mangler kontekst)
✗ "Stek kyllingen i olivenolje" (feil olje)
✗ "til den avgir en god duft" (unaturlig norsk)
✗ "Kok opp en stor med rikelig med saltet vann" (gebrokken grammatikk)

FORMAT:
- Enkle kulepunkter, ingen fet skrift som "Protein:" eller "Saus:"
- Hvert kulepunkt er ett kort forslag, f.eks. "Kokt ris eller ovnsbakte poteter" eller "En enkel pannesaus laget av stekesjyen"
- Maksimum 3 kulepunkter
- ALDRI inkluder et kulepunkt som forklarer hvorfor noe IKKE foreslås — spesielt aldri en setning som "Retten lager sin egen saus" eller "Retten inneholder allerede en kremet saus". Hvis en saus allerede er dekket av oppskriften, skal det bare utebli — ingen forklaring, ingen unnskyldning, ingen opplysning om det.
- Enten foreslå noe, eller unnlat det helt.
- Gjenta ALDRI noe som allerede er nevnt i oppskriftens ingredienser eller fremgangsmåte
- ALDRI foreslå en ingrediens i "Kan passe fint med:" som brukeren allerede har oppgitt som input. Hvis brukeren har poteter, ris, pasta, brød eller annen karbohydrat — bruk det i retten i stedet for å foreslå det her.
- POTETTILBEREDNING: Når du foreslår poteter som tilbehør, velg alltid den tilberedningsmåten som passer best til retten. Kokte poteter skal kun foreslås ved retter som naturlig passer med dem, som pochert eller dampet fisk, gryteretter, eller tradisjonelle norske middager. For pannestekte retter som omelett eller rørte egg, foreslå stekte eller ovnsbakte poteter i stedet — eller hopp over poteter helt hvis et annet tilbehør er mer naturlig.

Hvis ingenting faktisk mangler, utelat seksjonen helt — sett protein_suggestion, carb_suggestion og sauce_suggestion til null/tom.`;

    const userPrompt = `Jeg har dette hjemme: ${sanitizedIngredients}${isSingleWord ? "\n\n(Dette er ett enkelt ord — bruk regel 8: avvis med not_food hvis det ikke utvilsomt er en norsk matingrediens.)" : ""}\n\nForeslå én middag jeg kan lage i kveld.${data.regenerate ? " Gi en helt annen rett enn forrige gang." : ""}${data.excludeTitles && data.excludeTitles.length > 0 ? `\n\nDo not suggest any of these dishes: ${data.excludeTitles.join(", ")}. Velg en helt annen rett som ikke er en variasjon av disse.` : ""}${data.constraint ? `\n\nEkstra krav: ${data.constraint}` : ""} Returner tittel, beskrivelse, hvilke ingredienser jeg har (has_ingredients), hva jeg mangler (missing_ingredients, maks 3), full ingrediensliste med mengder (full_ingredients), fremgangsmåte (steps) — hvert steg må være minst 15 ord og beskrive hvordan handlingen utføres, ikke bare hva som gjøres, og hvilke av mine ingredienser som ikke passer til denne retten (unused_ingredients) med en kort forklaring (unused_reason). Inkluder også et estimat på tilberedningstid i minutter (time_estimate_min), navnet på ingrediensen i has_ingredients som passer dårligst (worst_fitting_have), og navnet på ingrediensen i unused_ingredients som lettest kunne passet inn i en variant av retten (best_fitting_unused).`;

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
            "Fremgangsmåte i fullstendige, beskrivende steg. KRAV: Hvert steg MÅ være minimum 15 ord. Hvert steg MÅ beskrive både handlingen, metoden og resultatet i én naturlig setning. Korte fragmenter som 'Skjær løken', 'Bland sammen smør' eller 'Vask tomatene' er IKKE tillatt — slike handlinger må slås sammen med tilstøtende steg slik at hvert steg er en komplett instruksjon.",
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
  const response = await fetch(LOVABLE_AI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey,
      "X-Lovable-AIG-SDK": "raw-fetch",
    },
    body: JSON.stringify({
      model: LOVABLE_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "foresla_middag",
            description: "Returner ett middagsforslag med full oppskrift",
            parameters: toolParameters,
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "foresla_middag" } },
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    const err = new Error(`Lovable AI gateway ${response.status}: ${text}`) as Error & { status?: number };
    err.status = response.status;
    throw err;
  }

  const json = (await response.json()) as {
    choices?: Array<{
      message?: {
        tool_calls?: Array<{ function?: { name?: string; arguments?: string } }>;
      };
    }>;
  };

  const toolCall = json.choices?.[0]?.message?.tool_calls?.[0]?.function;
  if (!toolCall || toolCall.name !== "foresla_middag" || !toolCall.arguments) {
    throw new Error("Lovable AI gateway returned no tool call");
  }

  try {
    return JSON.parse(toolCall.arguments) as Record<string, unknown>;
  } catch {
    throw new Error("Lovable AI gateway returned invalid tool arguments JSON");
  }
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
