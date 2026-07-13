import type { ComponentMap, NodeComponent } from "@boyscout/renderer";
// Import from per-component subpaths, not the package barrel: `@astryxdesign/core`'s
// top-level dist/index.d.ts re-exports ~100 submodules via bare `export * from './X'`,
// and under this repo's moduleResolution (NodeNext) every one of those star re-exports
// resolves to zero symbols (confirmed via the TS compiler API — only the handful of
// named `export { X } from './Y'` re-exports, e.g. Toast/Layer, survive). The package's
// own package.json exports map publishes a dedicated subpath per component
// (e.g. "./Button", "./Stack", "./Text") that bypasses the broken barrel entirely.
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Grid } from "@astryxdesign/core/Grid";
import { Heading, Text } from "@astryxdesign/core/Text";
import { HStack, VStack } from "@astryxdesign/core/Stack";

const str = (v: unknown): string => (typeof v === "string" ? v : "");

// ponytail: local mirrors of astryx's literal-union prop types (SpacingStep, HeadingLevel,
// ButtonVariant aren't re-exported from the package's top-level barrel) — snap arbitrary
// AST props onto the nearest valid literal instead of widening to `number`/`string`.
type SpacingStep = 0 | 0.5 | 1 | 1.5 | 2 | 3 | 4 | 5 | 6 | 8 | 10;
const SPACING_STEPS: readonly SpacingStep[] = [0, 0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10];
const spacing = (v: unknown, fallback: SpacingStep): SpacingStep =>
  SPACING_STEPS.find((s) => s === v) ?? fallback;

type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;
const HEADING_LEVELS: readonly HeadingLevel[] = [1, 2, 3, 4, 5, 6];
const headingLevel = (v: unknown): HeadingLevel => HEADING_LEVELS.find((l) => l === v) ?? 2;

type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";
const BUTTON_VARIANTS: readonly ButtonVariant[] = ["primary", "secondary", "ghost", "destructive"];
const buttonVariant = (v: unknown): ButtonVariant =>
  BUTTON_VARIANTS.find((b) => b === v) ?? "secondary";

const num = (v: unknown, d: number): number => (typeof v === "number" ? v : d);

const VStackNode: NodeComponent = ({ node, children }) => (
  <VStack gap={spacing(node.props?.["gap"], 0)}>{children}</VStack>
);
const HStackNode: NodeComponent = ({ node, children }) => (
  <HStack gap={spacing(node.props?.["gap"], 0)}>{children}</HStack>
);
const CardNode: NodeComponent = ({ children }) => <Card>{children}</Card>;
const GridNode: NodeComponent = ({ node, children }) => (
  <Grid columns={num(node.props?.["columns"], 1)}>{children}</Grid>
);
const HeadingNode: NodeComponent = ({ node }) => (
  <Heading level={headingLevel(node.props?.["level"])}>{str(node.props?.["text"])}</Heading>
);
const TextNode: NodeComponent = ({ node }) => <Text>{str(node.props?.["text"])}</Text>;
const ButtonNode: NodeComponent = ({ node }) => (
  <Button label={str(node.props?.["text"])} variant={buttonVariant(node.props?.["variant"])} />
);

/** Non-visual logic-bearing nodes carry no pixels — show a labeled structural placeholder. */
const placeholder =
  (label: string): NodeComponent =>
  ({ node, children }) => (
    <div style={{ border: "1px dashed #999", padding: 4, margin: 2, font: "12px monospace" }}>
      {label}: {str(node.props?.["name"])}
      {children}
    </div>
  );

export const astryxMap: ComponentMap = {
  VStack: VStackNode,
  HStack: HStackNode,
  Card: CardNode,
  Grid: GridNode,
  Heading: HeadingNode,
  Text: TextNode,
  Button: ButtonNode,
  Service: placeholder("service"),
  Method: placeholder("method"),
  Store: placeholder("store"),
  Action: placeholder("action"),
  Http: placeholder("http"),
  Endpoint: placeholder("endpoint"),
};
