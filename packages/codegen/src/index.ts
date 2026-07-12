import { Eta } from "eta";

// autoEscape off: output is source code, not HTML. autoTrim off: no whitespace surprises
// (final bytes are normalized by @boyscout/determinism format() downstream anyway).
const eta = new Eta({ autoEscape: false, autoTrim: false });

/** Run a dumb Eta template against `data` (referenced as `it` inside the template). */
export function render(template: string, data: Record<string, unknown>): string {
  return eta.renderString(template, data);
}
