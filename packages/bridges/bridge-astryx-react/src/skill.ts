import type { BridgeSkill } from "@boyscout/schemas";

export const skill: BridgeSkill = {
  conventions:
    "Author React components with the Astryx idiom. The generated seam is two files: a disposable scaffold under `.running/` (overwritten every run) and a durable, human-owned logic file under `src/` (created if absent, never overwritten). Regenerating preserves the human file; a typed contract pins the seam so signature drift is a compile error.",
  imports:
    "Import framework primitives from `@astryxdesign/core` and React from `react`. Do not deep-import internal paths — the Registry pins the allowed catalog of node types per capability.",
  tokens:
    "Use Astryx design tokens for spacing, color, and typography. Never hard-code a literal style value that a token already covers.",
  architecture:
    "Capabilities split into declarative (component) and logic-bearing (service, store, http). Declarative capabilities emit standards-conformant structure with typed logic-holes; logic-bearing capabilities scaffold structure only and leave behavior to the durable `src/` file. The preview `<Renderer/>` is authoring-stage infrastructure and never participates in generation.",
  naming:
    "Follow the bridge's naming rules (see naming.ts): PascalCase component identifiers, camelCase props and handlers, and file names that mirror the component identifier.",
};
