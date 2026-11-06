/**
 * A parser for the Mermaid flowchart subset that actually shows up in agent
 * output and documentation. Pure and dependency-free: Mermaid itself needs a DOM
 * and cannot run in a Paseo client bundle, and the transformer must stay
 * synchronous, so the grammar is walked by hand.
 *
 * Anything it fails to recognise is reported rather than guessed at, and the
 * renderer falls back to showing the source.
 */

export type Direction = "TD" | "TB" | "BT" | "LR" | "RL";
export type NodeShape =
  | "rect"
  | "round"
  | "stadium"
  | "subroutine"
  | "diamond"
  | "circle"
  | "asymmetric"
  | "cylinder"
  | "hexagon"
  | "lean-right"
  | "lean-left"
  | "trapezoid"
  | "trapezoid-top"
  | "double-circle";
export type EdgeStyle = "solid" | "dotted" | "thick";

export interface FlowNode {
  id: string;
  label: string;
  shape: NodeShape;
}

export interface FlowEdge {
  from: string;
  to: string;
  label: string | null;
  style: EdgeStyle;
  arrow: boolean;
}

export interface Flowchart {
  direction: Direction;
  nodes: FlowNode[];
  edges: FlowEdge[];
  /** Lines the parser chose not to interpret, so the UI can say so. */
  skipped: string[];
  /**
   * Every shape a mention gave, once each, in the order first given, including one a
   * later mention replaced. What the source has asked for so far only ever grows as
   * lines arrive, which a decision made while a diagram streams can rely on.
   */
  shapes: NodeShape[];
}

const DIRECTIVE = /%%\{/;
const HEADER = /^\s*(?:flowchart|graph)(?:\s+(TD|TB|BT|LR|RL))?\s*$/i;

/** Longest first: `-.->` must win over `-.-`. */
const OPERATORS: { token: string; style: EdgeStyle; arrow: boolean }[] = [
  { token: "-.->", style: "dotted", arrow: true },
  { token: "==>", style: "thick", arrow: true },
  { token: "-->", style: "solid", arrow: true },
  { token: "-.-", style: "dotted", arrow: false },
  { token: "===", style: "thick", arrow: false },
  { token: "---", style: "solid", arrow: false },
];

/**
 * Tried in order, and the first whose opener sits after the id and whose closer ends
 * the text wins, so a longer opener goes before any shorter one it starts with:
 * `(((` before `((`, `[(`, `[/` and `[\` before `[`, `{{` before `{`. The slash
 * shapes share an opener and are told apart by the closer: `[/ /]` leans right,
 * `[\ \]` leans left, `[/ \]` is a trapezoid and `[\ /]` its upside-down twin.
 */
export const OPENERS: readonly { open: string; close: string; shape: NodeShape }[] = [
  { open: "(((", close: ")))", shape: "double-circle" },
  { open: "([", close: "])", shape: "stadium" },
  { open: "[[", close: "]]", shape: "subroutine" },
  { open: "[(", close: ")]", shape: "cylinder" },
  { open: "((", close: "))", shape: "circle" },
  { open: "{{", close: "}}", shape: "hexagon" },
  { open: "[/", close: "/]", shape: "lean-right" },
  { open: "[\\", close: "\\]", shape: "lean-left" },
  { open: "[/", close: "\\]", shape: "trapezoid" },
  { open: "[\\", close: "/]", shape: "trapezoid-top" },
  { open: "[", close: "]", shape: "rect" },
  { open: "(", close: ")", shape: "round" },
  { open: "{", close: "}", shape: "diamond" },
  { open: ">", close: "]", shape: "asymmetric" },
];

/**
 * Mermaid 11.16's short names and aliases for the shapes this plugin draws, for
 * `id@{ shape: <name> }`. Every other name (`cloud`, `bolt`, `doc`, ...) is a shape it
 * does not draw, and a Map keeps `constructor` from counting as a name.
 */
const SHAPE_NAMES: ReadonlyMap<string, NodeShape> = new Map(
  (
    [
      ["rect", ["rect", "proc", "process", "rectangle"]],
      ["round", ["rounded", "event"]],
      ["stadium", ["stadium", "terminal", "pill"]],
      ["subroutine", ["fr-rect", "subprocess", "subproc", "framed-rectangle", "subroutine"]],
      ["cylinder", ["cyl", "db", "database", "cylinder"]],
      ["circle", ["circle", "circ"]],
      ["diamond", ["diam", "decision", "diamond", "question"]],
      ["hexagon", ["hex", "hexagon", "prepare"]],
      ["lean-right", ["lean-r", "lean-right", "in-out"]],
      ["lean-left", ["lean-l", "lean-left", "out-in"]],
      ["trapezoid", ["trap-b", "priority", "trapezoid-bottom", "trapezoid"]],
      ["trapezoid-top", ["trap-t", "manual", "trapezoid-top", "inv-trapezoid"]],
      ["double-circle", ["dbl-circ", "double-circle"]],
    ] as [NodeShape, string[]][]
  ).flatMap(([shape, names]) => names.map((name): [string, NodeShape] => [name, shape])),
);

/** The shape a Mermaid 11 `@{ shape: <name> }` name stands for, or null when this plugin does not draw it. Names are lower case, as in Mermaid. */
export function shapeFromName(name: string): NodeShape | null {
  return SHAPE_NAMES.get(name) ?? null;
}

export interface ShapeField {
  key: string;
  value: string;
  quoted: boolean;
}

/**
 * Reads the `key: value, key: value }` that follows an `@{`, from `from`, and says where
 * the `}` ends. Keys are any word, so the span of an object this plugin will refuse
 * (`img`, `icon`, `pos`, ...) is still found whole. Mermaid's lexer treats only `"` as
 * opening a string: a double-quoted value may hold `,` `:` `{` and `}`, but in a
 * single-quoted or an unquoted value a `}` ends the object and a `"` opens a string
 * that never closes, so a single-quoted value holding either is null. An unquoted value
 * runs to the next `,` or `}` and may hold none of the characters YAML or Mermaid would
 * read as more structure. Anything else, from a missing space after the colon to a
 * trailing comma, a backslash escape or an unclosed quote, is null: an object read
 * halfway would draw the rest of it as stray text.
 */
export function scanShapeObject(text: string, from: number): { fields: ShapeField[]; end: number } | null {
  const fields: ShapeField[] = [];
  let index = from;
  const skipSpace = () => {
    while (index < text.length && /\s/.test(text[index])) index += 1;
  };

  for (;;) {
    skipSpace();
    const key = /^[A-Za-z][\w-]*/.exec(text.slice(index));
    if (!key) return null;
    index += key[0].length;
    if (text[index] !== ":" || !/\s/.test(text[index + 1] ?? "")) return null;
    index += 1;
    skipSpace();

    const quote = text[index];
    let value: string;
    let quoted = false;
    if (quote === '"' || quote === "'") {
      const close = text.indexOf(quote, index + 1);
      if (close < 0) return null;
      value = text.slice(index + 1, close);
      // `\"` and `\n` mean something else in a double-quoted YAML string than they do here.
      if (quote === '"' && value.includes("\\")) return null;
      // Mermaid ignores single quotes, so its object ends at a `}` here and a `"` starts a string.
      if (quote === "'" && /[}"]/.test(value)) return null;
      quoted = true;
      index = close + 1;
    } else {
      const stop = text.slice(index).search(/[,}]/);
      if (stop < 0) return null;
      value = text.slice(index, index + stop).trim();
      if (value.length === 0 || /["'`{[\]#]|:(?:\s|$)/.test(value)) return null;
      index += stop;
    }
    fields.push({ key: key[0], value, quoted });

    skipSpace();
    if (text[index] === "}") return { fields, end: index + 1 };
    if (text[index] !== ",") return null;
    index += 1;
  }
}

/** Where each readable `@{ ... }` starts and ends in a line, so a `-->` or a `--` inside one is not mistaken for an edge. */
function shapeObjectSpans(line: string): [number, number][] {
  const spans: [number, number][] = [];
  let from = 0;
  for (;;) {
    const at = line.indexOf("@{", from);
    if (at < 0) return spans;
    const object = scanShapeObject(line, at + 2);
    if (object) {
      spans.push([at, object.end]);
      from = object.end;
    } else {
      from = at + 2;
    }
  }
}

/**
 * Mermaid writes an edge label two ways. Rewriting `A -- yes --> B` into
 * `A -->|yes| B` lets the splitter handle one form.
 */
export function normalizeEdgeLabels(line: string): string {
  // A shape object's text is a label, not edge syntax, so the rewrite never reaches into one.
  let result = "";
  let from = 0;
  for (const [start, end] of shapeObjectSpans(line)) {
    result += normalizeOutsideShapeObjects(line.slice(from, start)) + line.slice(start, end);
    from = end;
  }
  return result + normalizeOutsideShapeObjects(line.slice(from));
}

function normalizeOutsideShapeObjects(text: string): string {
  return text
    .replace(/--\s+([^->|]+?)\s+-->/g, "-->|$1|")
    .replace(/-\.\s+([^.|>]+?)\s+\.->/g, "-.->|$1|")
    .replace(/==\s+([^=|>]+?)\s+==>/g, "==>|$1|");
}

function breakLines(value: string): string {
  return value.replace(/<br\s*\/?>/gi, "\n").trim();
}

function stripQuotes(value: string): string {
  const trimmed = value.trim();
  const quoted = /^"(.*)"$/s.exec(trimmed) ?? /^'(.*)'$/s.exec(trimmed);
  return breakLines(quoted ? quoted[1] : trimmed);
}

/** `"`text`"`: Mermaid's Markdown string, which this plugin does not format. */
function isMarkdownString(inner: string): boolean {
  return /^`[\s\S]*`$/.test(inner.trim());
}

/**
 * The label inside a shape's brackets, or null when the brackets hold syntax this
 * plugin would draw wrong. Refusing it puts the line among the skipped ones, which
 * leaves the diagram to Paseo.
 *
 * A quoted label may hold anything but its own quote and a Markdown string. Unquoted,
 * a square bracket or the shape's own closing bracket means a second node run into
 * this one (`A[x] & B[y]`, `A(x); B(y)`), a label wrapped whole in brackets is a second
 * shape nested in the first (`A[([x])]`, `A(({x}))`), and slashes at both ends are a
 * parallelogram or a trapezoid nested in it. The shapes that bracket syntax itself
 * names (`[(db)]`, `{{hex}}`, `(((x)))`, `[/in/]`) are read as openers before a label
 * is looked at. Other brackets inside the text, as in `A[Reload (beta)]`, stay part
 * of the label.
 */
function labelOf(inner: string, close: string): string | null {
  const trimmed = inner.trim();
  const quoted = /^"([^"]*)"$/.exec(trimmed) ?? /^'([^']*)'$/.exec(trimmed);
  if (quoted) return isMarkdownString(quoted[1]) ? null : stripQuotes(trimmed);
  if (/[[\]]/.test(trimmed) || [...close].some((char) => trimmed.includes(char))) return null;
  if (/^[([{][\s\S]*[)\]}]$/.test(trimmed)) return null;
  if (/^[/\\][\s\S]*[/\\]$/.test(trimmed)) return null;
  return stripQuotes(trimmed);
}

/**
 * A node as one statement wrote it. A node is mentioned many times in a diagram and
 * Mermaid keeps the last shape and the last label any mention gave, so what the text
 * actually said matters: a bare `A` gives neither, `A@{ shape: db }` gives only a shape.
 */
export interface NodeMention {
  node: FlowNode;
  /** The text carried a label; otherwise `node.label` is just the id. */
  labelled: boolean;
  /** The text carried a shape; otherwise `node.shape` is just the default `rect`. */
  shaped: boolean;
}

/**
 * The shape and the label field of a shape object this plugin reads: only the `shape`
 * and `label` keys, each once, and a shape name it draws. Anything else (another key, an
 * unknown shape, a Markdown string label) is null.
 */
export function readShapeFields(fields: ShapeField[]): { shape: NodeShape; label: ShapeField | undefined } | null {
  const values = new Map<string, ShapeField>();
  for (const field of fields) {
    if (field.key !== "shape" && field.key !== "label") return null;
    if (values.has(field.key)) return null;
    values.set(field.key, field);
  }

  const name = values.get("shape");
  const shape = name ? shapeFromName(name.value) : null;
  if (shape === null) return null;

  const label = values.get("label");
  if (label?.quoted && isMarkdownString(label.value)) return null;
  return { shape, label };
}

/**
 * Reads `id@{ shape: cyl, label: "Orders" }`, where `at` is the index of the `@{`. The
 * object has to be the whole of the text, and `readShapeFields` has to accept it. Anything
 * else (another key, an unknown shape, a node run in after it with `&`) is null, so the
 * line counts as skipped.
 */
function parseShapeObject(text: string, at: number, id: string): NodeMention | null {
  const object = scanShapeObject(text, at + 2);
  if (!object || text.slice(object.end).trim().length > 0) return null;

  const read = readShapeFields(object.fields);
  if (!read) return null;

  const label = read.label ? breakLines(read.label.value) : "";
  return { node: { id, label: label.length > 0 ? label : id, shape: read.shape }, labelled: label.length > 0, shaped: true };
}

/** Reads `id`, `id[Label]`, `id{Decision}`, `id((Circle))`, `id@{ shape: cyl }` and friends. */
export function parseNodeExpression(raw: string): FlowNode | null {
  return readNodeMention(raw)?.node ?? null;
}

export function readNodeMention(raw: string): NodeMention | null {
  const text = raw.trim();
  if (text.length === 0) return null;

  const at = text.indexOf("@{");
  if (at > 0) {
    const id = text.slice(0, at).trim();
    // Not an id in front of it (`A["see @{ x }"]`): the bracket shapes below read it.
    if (/^[\w.-]+$/.test(id)) return parseShapeObject(text, at, id);
  }

  for (const { open, close, shape } of OPENERS) {
    const start = text.indexOf(open);
    if (start <= 0) continue;
    if (!text.endsWith(close)) continue;
    const id = text.slice(0, start).trim();
    if (!/^[\w.-]+$/.test(id)) continue;
    // The longest opener that fits is the shape meant; a label it cannot read is final.
    const label = labelOf(text.slice(start + open.length, text.length - close.length), close);
    if (label === null) return null;
    return { node: { id, label: label.length > 0 ? label : id, shape }, labelled: label.length > 0, shaped: true };
  }

  if (!/^[\w.-]+$/.test(text)) return null;
  return { node: { id: text, label: text, shape: "rect" }, labelled: false, shaped: false };
}

interface Split {
  parts: string[];
  operators: { style: EdgeStyle; arrow: boolean; label: string | null }[];
}

/** Splits `A -->|yes| B --> C` into its nodes and the operators between them. */
export function splitChain(line: string): Split | null {
  const parts: string[] = [];
  const operators: Split["operators"] = [];
  // Operators are looked for in a copy where each `@{ ... }` is blanked out, so one inside a quoted label is text.
  const searchable = maskShapeObjects(line);
  let cursor = 0;

  for (;;) {
    let best: { index: number; op: (typeof OPERATORS)[number] } | null = null;
    for (const op of OPERATORS) {
      const index = searchable.indexOf(op.token, cursor);
      if (index < 0) continue;
      if (!best || index < best.index || (index === best.index && op.token.length > best.op.token.length)) {
        best = { index, op };
      }
    }
    if (!best) break;

    parts.push(line.slice(cursor, best.index));
    let next = best.index + best.op.token.length;

    let label: string | null = null;
    const labelled = /^\s*\|([^|]*)\|/.exec(line.slice(next));
    if (labelled) {
      label = stripQuotes(labelled[1]);
      next += labelled[0].length;
    }

    operators.push({ style: best.op.style, arrow: best.op.arrow, label });
    cursor = next;
  }

  if (operators.length === 0) return null;
  parts.push(line.slice(cursor));
  return { parts, operators };
}

/** `line` with each readable `@{ ... }` overwritten by `_`, same length, so indexes still match the original and no operator can be found inside one. */
function maskShapeObjects(line: string): string {
  let masked = line;
  for (const [start, end] of shapeObjectSpans(line)) {
    masked = masked.slice(0, start) + "_".repeat(end - start) + masked.slice(end);
  }
  return masked;
}

/**
 * One statement as the parser reads it: its node mentions in the order written and the
 * operators between them, or null when the parser skips the line. `line` is one line of
 * a flowchart without its comment, and not a header, subgraph or styling line.
 */
export function readStatement(line: string): { mentions: NodeMention[]; operators: Split["operators"] } | null {
  const chain = splitChain(normalizeEdgeLabels(line));
  if (!chain) {
    const single = readNodeMention(line.replace(/;$/, ""));
    return single ? { mentions: [single], operators: [] } : null;
  }

  const mentions: NodeMention[] = [];
  for (const part of chain.parts) {
    const mention = readNodeMention(part.replace(/;$/, ""));
    if (!mention) return null;
    mentions.push(mention);
  }
  return { mentions, operators: chain.operators };
}

export function parseFlowchart(source: string): Flowchart | null {
  const lines = source.split("\n");
  let direction: Direction | null = null;
  const nodes = new Map<string, FlowNode>();
  const edges: FlowEdge[] = [];
  const skipped: string[] = [];
  const shapes = new Set<NodeShape>();

  // Last wins, as in Mermaid: a mention that gives a label replaces the label, one that gives a shape replaces the shape, and a bare id changes neither.
  const remember = ({ node, labelled, shaped }: NodeMention) => {
    if (shaped) shapes.add(node.shape);
    const existing = nodes.get(node.id);
    nodes.set(
      node.id,
      existing ? { id: node.id, label: labelled ? node.label : existing.label, shape: shaped ? node.shape : existing.shape } : node,
    );
  };

  for (const original of lines) {
    // `%%{init: …}%%`, anywhere on a line, is a directive, not a comment: it configures the diagram, which this plugin does not do.
    if (DIRECTIVE.test(original)) {
      skipped.push(original.trim());
      continue;
    }
    const line = original.replace(/%%.*$/, "").trim();
    if (line.length === 0) continue;

    const header = HEADER.exec(line);
    if (header) {
      direction = (header[1]?.toUpperCase() as Direction) ?? "TD";
      continue;
    }
    if (direction === null) {
      // Not a flowchart at all; let another parser have it.
      return null;
    }

    // Subgraphs are not laid out yet; their contents still render as nodes.
    if (/^subgraph\b/i.test(line) || /^end$/i.test(line)) {
      skipped.push(original.trim());
      continue;
    }
    if (/^(?:style|classDef|class|click|linkStyle)\b/i.test(line)) {
      skipped.push(original.trim());
      continue;
    }

    const statement = readStatement(line);
    if (!statement) {
      skipped.push(original.trim());
      continue;
    }

    const { mentions, operators } = statement;
    for (const mention of mentions) remember(mention);
    for (let index = 0; index < operators.length; index += 1) {
      const operator = operators[index];
      edges.push({
        from: mentions[index].node.id,
        to: mentions[index + 1].node.id,
        label: operator.label,
        style: operator.style,
        arrow: operator.arrow,
      });
    }
  }

  if (direction === null) return null;
  return { direction, nodes: [...nodes.values()], edges, skipped, shapes: [...shapes] };
}
