export interface CatalogEntry {
  selector: string;
  symbol: string;
  importPath: string;
}

/** Material element-selector components (node type -> real @angular/material symbol). Extend by adding rows. */
export const CATALOG: Record<string, CatalogEntry> = {
  Card: { selector: "mat-card", symbol: "MatCard", importPath: "@angular/material/card" },
  CardTitle: {
    selector: "mat-card-title",
    symbol: "MatCardTitle",
    importPath: "@angular/material/card",
  },
  CardContent: {
    selector: "mat-card-content",
    symbol: "MatCardContent",
    importPath: "@angular/material/card",
  },
  Toolbar: { selector: "mat-toolbar", symbol: "MatToolbar", importPath: "@angular/material/toolbar" },
  List: { selector: "mat-list", symbol: "MatList", importPath: "@angular/material/list" },
  ListItem: {
    selector: "mat-list-item",
    symbol: "MatListItem",
    importPath: "@angular/material/list",
  },
};

export const COMPONENTS: readonly string[] = Object.keys(CATALOG);

/** Nodes whose `text` prop renders as the element's text child rather than an attribute. */
export const TEXT_CHILD: ReadonlySet<string> = new Set(["CardTitle", "Toolbar", "ListItem"]);

const PARAMS: Record<string, readonly string[]> = {
  // component (declarative; container elements take no positional params by default)
  Card: [],
  CardTitle: ["text"],
  CardContent: [],
  Toolbar: ["text"],
  List: [],
  ListItem: ["text"],
  // form
  Form: ["name"],
  Field: ["name", "label", "type"],
  // route
  Routes: [],
  Route: ["path", "component"],
  // http
  Http: ["name"],
  Endpoint: ["name", "method", "path", "response"],
};

export function paramsFor(nodeType: string): readonly string[] {
  return PARAMS[nodeType] ?? [];
}
