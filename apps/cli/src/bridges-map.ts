import { bridge as astryxBridge } from "@boyscout/bridge-astryx-react";
import { bridge as materialBridge } from "@boyscout/bridge-material";
import type { Bridge } from "@boyscout/schemas";

/** Tech stack the user picks at init; each maps to exactly one built-in bridge. */
export type Stack = "react" | "angular";

/** React → Astryx/React, Angular → Material/Angular. Both are wired into `generate` already. */
export function bridgeFor(stack: Stack): Bridge {
  return stack === "angular" ? materialBridge : astryxBridge;
}

/** The capabilities the stack's bridge can generate — the menu `init` offers and its default. */
export function capabilitiesFor(stack: Stack): string[] {
  return [...bridgeFor(stack).registry.capabilities];
}
