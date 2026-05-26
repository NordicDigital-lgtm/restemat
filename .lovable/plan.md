## Problem

«Finn middag» blir stående på «Finner middag…» og fullfører aldri.

Server-loggene viser to ting:
1. Nylige forsøk feiler med `Lovable AI gateway failed Error: Lovable AI gateway returned no tool call`.
2. Modellen som brukes i `src/lib/recipe.functions.ts` er `google/gemini-3-flash-preview` — denne modellen finnes ikke (eller støtter ikke tool calling) på Lovable AI Gateway, så svaret kommer tilbake uten `tool_calls`, kastes som en feil, og frontenden viser feilmeldingen — men i mange tilfeller henger requesten lenge før den feiler.

## Løsning

Bytt `LOVABLE_MODEL` i `src/lib/recipe.functions.ts` til en gyldig modell som støtter tool calling på Lovable AI Gateway:

```ts
const LOVABLE_MODEL = "google/gemini-2.5-flash";
```

`google/gemini-2.5-flash` er standardmodellen på Lovable AI Gateway, er gratis frem til 31.10.2025 og støtter function/tool calling som koden krever.

## Verifisering

- Bygg prosjektet
- Test «Finn middag» i preview med f.eks. «kylling, ris, paprika» og bekreft at en oppskrift returneres
- Sjekk server-loggene for `→ 200` uten «returned no tool call»-feil

Ingen andre endringer.