import type { BridgeSkill } from "@boyscout/schemas";

export const skill: BridgeSkill = {
  conventions:
    "Generate governed Angular with Material Design. Emit standalone components; the generated scaffold under `.running/` is disposable and the durable logic lives in human-owned `src/` files created if absent. The typed seam contract makes signature drift a compile error.",
  imports:
    "Import Angular primitives from `@angular/core` and Material components from `@angular/material/*`. Respect module boundaries — do not import across feature boundaries the Registry does not sanction.",
  tokens:
    "Use the Material theme tokens for color, elevation, and typography. Never hard-code a value that a theme token already provides.",
  architecture:
    "Wire dependencies through Angular DI. Separate presentational components from service/store layers; logic-bearing capabilities (service, store, http-with-transforms) scaffold structure and leave behavior to the durable `src/` layer. Material previews are honest structural wireframes, authoring-stage only.",
  naming:
    "Follow the bridge's naming rules (see naming.ts): PascalCase class identifiers with the Angular suffix convention, camelCase members, and kebab-case selectors and file names.",
};
