/** SP4a .openui parser: text -> raw structures. Registry-free, pure syntax; trivia is dropped (canonical-normalizing). */

export type Literal = string | number | boolean | null;

export interface RawNode {
  type: string;
  args: Literal[];
  children: RawNode[];
  line: number;
}
export interface RawFeature {
  capability: string;
  id: string;
  node: RawNode;
  line: number;
}
export interface RawFile {
  header: Record<string, string>;
  features: RawFeature[];
}

export class DialectError extends Error {
  constructor(
    message: string,
    public readonly line: number,
  ) {
    super(`${message} (line ${line})`);
    this.name = "DialectError";
  }
}

interface Token {
  kind: "ident" | "string" | "number" | "punct" | "keyword";
  value: string;
  num: number;
  line: number;
}

const KEYWORDS = new Set(["true", "false", "null"]);
const IDENT_START = /[A-Za-z_]/;
const IDENT_CHAR = /[A-Za-z0-9_-]/;
const DIGIT = /[0-9]/;

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let line = 1;
  let i = 0;
  const n = src.length;
  // NOTE: noUncheckedIndexedAccess is on — use src.charAt(k) (always returns string, "" past end)
  // rather than src[k] (which types as string | undefined) for all character reads.
  while (i < n) {
    const c = src.charAt(i);
    if (c === "\n") {
      line++;
      i++;
      continue;
    }
    if (c === " " || c === "\t" || c === "\r") {
      i++;
      continue;
    }
    if (c === "(" || c === ")" || c === "{" || c === "}" || c === "," || c === "=") {
      tokens.push({ kind: "punct", value: c, num: 0, line });
      i++;
      continue;
    }
    if (c === '"') {
      let s = "";
      i++;
      let closed = false;
      while (i < n) {
        const d = src.charAt(i);
        if (d === "\\") {
          const e = src.charAt(i + 1);
          if (e === '"') s += '"';
          else if (e === "\\") s += "\\";
          else if (e === "n") s += "\n";
          else if (e === "t") s += "\t";
          else throw new DialectError(`invalid string escape "\\${e ?? ""}"`, line);
          i += 2;
          continue;
        }
        if (d === '"') {
          closed = true;
          i++;
          break;
        }
        if (d === "\n") break;
        s += d;
        i++;
      }
      if (!closed) throw new DialectError("unterminated string literal", line);
      tokens.push({ kind: "string", value: s, num: 0, line });
      continue;
    }
    if (c === "-" || DIGIT.test(c)) {
      let j = i + 1;
      while (j < n && (DIGIT.test(src.charAt(j)) || src.charAt(j) === ".")) j++;
      const text = src.slice(i, j);
      const num = Number(text);
      if (Number.isNaN(num)) throw new DialectError(`invalid number "${text}"`, line);
      tokens.push({ kind: "number", value: text, num, line });
      i = j;
      continue;
    }
    if (IDENT_START.test(c)) {
      let j = i + 1;
      while (j < n && IDENT_CHAR.test(src.charAt(j))) j++;
      const text = src.slice(i, j);
      tokens.push({ kind: KEYWORDS.has(text) ? "keyword" : "ident", value: text, num: 0, line });
      i = j;
      continue;
    }
    throw new DialectError(`unexpected character "${c}"`, line);
  }
  return tokens;
}

class Parser {
  private pos = 0;
  constructor(private readonly tokens: Token[]) {}

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }
  private next(): Token {
    const t = this.tokens[this.pos++];
    if (!t) throw new DialectError("unexpected end of input", this.lastLine());
    return t;
  }
  private lastLine(): number {
    return this.tokens[this.tokens.length - 1]?.line ?? 1;
  }
  private isPunct(p: string): boolean {
    const t = this.peek();
    return t !== undefined && t.kind === "punct" && t.value === p;
  }
  private expectPunct(p: string): void {
    const t = this.next();
    if (t.kind !== "punct" || t.value !== p) {
      throw new DialectError(`expected "${p}" but found "${t.value}"`, t.line);
    }
  }
  private expectIdent(): Token {
    const t = this.next();
    if (t.kind !== "ident")
      throw new DialectError(`expected identifier but found "${t.value}"`, t.line);
    return t;
  }

  parseFile(): RawFile {
    const header = this.parseHeader();
    const features: RawFeature[] = [];
    while (this.peek()) features.push(this.parseFeature());
    return { header, features };
  }

  private parseHeader(): Record<string, string> {
    const kw = this.next();
    if (kw.value !== "spec")
      throw new DialectError(`expected "spec" header but found "${kw.value}"`, kw.line);
    const header: Record<string, string> = {};
    while (this.isHeaderKv()) {
      const key = this.expectIdent();
      this.expectPunct("=");
      const val = this.next();
      if (val.kind !== "ident" && val.kind !== "number" && val.kind !== "keyword") {
        throw new DialectError(`expected header value but found "${val.value}"`, val.line);
      }
      header[key.value] = val.value;
    }
    return header;
  }

  // A header entry is `ident = ...`; a feature is `ident ident = ...`. Disambiguate on the 2nd token.
  private isHeaderKv(): boolean {
    const a = this.tokens[this.pos];
    const b = this.tokens[this.pos + 1];
    return a?.kind === "ident" && b?.kind === "punct" && b?.value === "=";
  }

  private parseFeature(): RawFeature {
    const cap = this.expectIdent();
    const id = this.expectIdent();
    this.expectPunct("=");
    const node = this.parseNode();
    return { capability: cap.value, id: id.value, node, line: cap.line };
  }

  private parseNode(): RawNode {
    const type = this.expectIdent();
    const args: Literal[] = [];
    const children: RawNode[] = [];
    if (this.isPunct("(")) {
      this.expectPunct("(");
      if (!this.isPunct(")")) {
        args.push(this.parseLiteral());
        while (this.isPunct(",")) {
          this.expectPunct(",");
          args.push(this.parseLiteral());
        }
      }
      this.expectPunct(")");
    }
    if (this.isPunct("{")) {
      this.expectPunct("{");
      while (!this.isPunct("}")) {
        if (!this.peek()) throw new DialectError(`unterminated "{" block`, type.line);
        children.push(this.parseNode());
      }
      this.expectPunct("}");
    }
    return { type: type.value, args, children, line: type.line };
  }

  private parseLiteral(): Literal {
    const t = this.next();
    if (t.kind === "string") return t.value;
    if (t.kind === "number") return t.num;
    if (t.kind === "keyword") return t.value === "true" ? true : t.value === "false" ? false : null;
    throw new DialectError(
      `expected a literal (string, number, true, false, null) but found "${t.value}"`,
      t.line,
    );
  }
}

export function parseOpenuiRaw(src: string): RawFile {
  return new Parser(tokenize(src)).parseFile();
}
