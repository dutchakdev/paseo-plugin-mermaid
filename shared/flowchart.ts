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
export type NodeShape = "rect" | "round" | "stadium" | "subroutine" | "diamond" | "circle" | "asymmetric";
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

const OPENERS: { open: string; close: string; shape: NodeShape }[] = [
  { open: "([", close: "])", shape: "stadium" },
  { open: "[[", close: "]]", shape: "subroutine" },
  { open: "((", close: "))", shape: "circle" },
  { open: "[", close: "]", shape: "rect" },
  { open: "(", close: ")", shape: "round" },
  { open: "{", close: "}", shape: "diamond" },
  { open: ">", close: "]", shape: "asymmetric" },
];

/**
 * Mermaid writes an edge label two ways. Rewriting `A -- yes --> B` into
 * `A -->|yes| B` lets the splitter handle one form.
 */
export function normalizeEdgeLabels(line: string): string {
  return line
    .replace(/--\s+([^->|]+?)\s+-->/g, "-->|$1|")
    .replace(/-\.\s+([^.|>]+?)\s+\.->/g, "-.->|$1|")
    .replace(/==\s+([^=|>]+?)\s+==>/g, "==>|$1|");
}

function stripQuotes(value: string): string {
  const trimmed = value.trim();
  const quoted = /^"(.*)"$/s.exec(trimmed) ?? /^'(.*)'$/s.exec(trimmed);
  return (quoted ? quoted[1] : trimmed).replace(/<br\s*\/?>/gi, "\n").trim();
}

/**
 * The label inside a shape's brackets, or null when the brackets hold syntax this
 * plugin would draw wrong. Refusing it puts the line among the skipped ones, which
 * leaves the diagram to Paseo.
 *
 * A quoted label may hold anything but its own quote and a Markdown string. Unquoted,
 * a square bracket or the shape's own closing bracket means a second node run into
 * this one (`A[x] & B[y]`, `A(x); B(y)`), a label wrapped whole in brackets is another
 * shape (`[(db)]`, `{{hex}}`, `(((x)))`), and slashes at both ends are a parallelogram
 * or a trapezoid. Other brackets inside the text, as in `A[Reload (beta)]`, stay part
 * of the label.
 */
function labelOf(inner: string, close: string): string | null {
  const trimmed = inner.trim();
  const quoted = /^"([^"]*)"$/.exec(trimmed) ?? /^'([^']*)'$/.exec(trimmed);
  if (quoted) return /^`[\s\S]*`$/.test(quoted[1].trim()) ? null : stripQuotes(trimmed);
  if (/[[\]]/.test(trimmed) || [...close].some((char) => trimmed.includes(char))) return null;
  if (/^[([{][\s\S]*[)\]}]$/.test(trimmed)) return null;
  if (/^[/\\][\s\S]*[/\\]$/.test(trimmed)) return null;
  return stripQuotes(trimmed);
}

/** Reads `id`, `id[Label]`, `id{Decision}`, `id((Circle))` and friends. */
export function parseNodeExpression(raw: string): FlowNode | null {
  const text = raw.trim();
  if (text.length === 0) return null;

  for (const { open, close, shape } of OPENERS) {
    const start = text.indexOf(open);
    if (start <= 0) continue;
    if (!text.endsWith(close)) continue;
    const id = text.slice(0, start).trim();
    if (!/^[\w.-]+$/.test(id)) continue;
    // The longest opener that fits is the shape meant; a label it cannot read is final.
    const label = labelOf(text.slice(start + open.length, text.length - close.length), close);
    if (label === null) return null;
    return { id, label: label.length > 0 ? label : id, shape };
  }

  if (!/^[\w.-]+$/.test(text)) return null;
  return { id: text, label: text, shape: "rect" };
}

interface Split {
  parts: string[];
  operators: { style: EdgeStyle; arrow: boolean; label: string | null }[];
}

/** Splits `A -->|yes| B --> C` into its nodes and the operators between them. */
export function splitChain(line: string): Split | null {
  const parts: string[] = [];
  const operators: Split["operators"] = [];
  let rest = line;

  for (;;) {
    let best: { index: number; op: (typeof OPERATORS)[number] } | null = null;
    for (const op of OPERATORS) {
      const index = rest.indexOf(op.token);
      if (index < 0) continue;
      if (!best || index < best.index || (index === best.index && op.token.length > best.op.token.length)) {
        best = { index, op };
      }
    }
    if (!best) break;

    parts.push(rest.slice(0, best.index));
    let after = rest.slice(best.index + best.op.token.length);

    let label: string | null = null;
    const labelled = /^\s*\|([^|]*)\|/.exec(after);
    if (labelled) {
      label = stripQuotes(labelled[1]);
      after = after.slice(labelled[0].length);
    }

    operators.push({ style: best.op.style, arrow: best.op.arrow, label });
    rest = after;
  }

  if (operators.length === 0) return null;
  parts.push(rest);
  return { parts, operators };
}

export function parseFlowchart(source: string): Flowchart | null {
  const lines = source.split("\n");
  let direction: Direction | null = null;
  const nodes = new Map<string, FlowNode>();
  const edges: FlowEdge[] = [];
  const skipped: string[] = [];

  const remember = (node: FlowNode) => {
    const existing = nodes.get(node.id);
    // A later definition carrying a real label wins over a bare id mention.
    if (!existing || (existing.label === existing.id && node.label !== node.id)) {
      nodes.set(node.id, node);
    }
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

    const chain = splitChain(normalizeEdgeLabels(line));
    if (!chain) {
      const single = parseNodeExpression(line.replace(/;$/, ""));
      if (single) remember(single);
      else skipped.push(original.trim());
      continue;
    }

    const parsed = chain.parts.map((part) => parseNodeExpression(part.replace(/;$/, "")));
    if (parsed.some((node) => node === null)) {
      skipped.push(original.trim());
      continue;
    }

    for (const node of parsed) remember(node as FlowNode);
    for (let index = 0; index < chain.operators.length; index += 1) {
      const operator = chain.operators[index];
      edges.push({
        from: (parsed[index] as FlowNode).id,
        to: (parsed[index + 1] as FlowNode).id,
        label: operator.label,
        style: operator.style,
        arrow: operator.arrow,
      });
    }
  }

  if (direction === null) return null;
  return { direction, nodes: [...nodes.values()], edges, skipped };
}
