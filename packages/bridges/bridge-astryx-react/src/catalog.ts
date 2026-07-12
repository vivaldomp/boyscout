/** The SP2 Astryx catalog: AST node type === Astryx component name (1:1). Extend by adding rows. */
export const COMPONENTS = [
  "VStack",
  "HStack",
  "Card",
  "Grid",
  "Heading",
  "Text",
  "Button",
] as const;

/** Components whose `text` prop is rendered as the JSX child rather than an attribute. */
export const TEXT_CHILD: ReadonlySet<string> = new Set(["Heading", "Text", "Button"]);
