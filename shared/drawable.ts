import { type NodeShape, parseFlowchart } from "./flowchart";
import { parseSequence } from "./sequence";

/** Diagram keywords whose diagrams this plugin draws, in Mermaid's spelling. */
const DRAWN = ["flowchart", "graph", "sequenceDiagram"];

/** Shapes drawn by shearing a View, which needs `skewX`. */
const SLANTED: ReadonlySet<NodeShape> = new Set(["lean-right", "lean-left", "trapezoid", "trapezoid-top"]);

export interface DrawableOptions {
  /**
   * Whether the app can shear a View. React Native on Android drops `skewX`, so
   * there a parallelogram or trapezoid would come out as an upright box, and a
   * diagram with one is left to Mermaid like any other this plugin does not draw.
   * True by default.
   */
  skew?: boolean;
}

/**
 * Whether this plugin draws everything in a diagram.
 *
 * When it does not, the diagram goes to Mermaid, which draws every diagram type, so
 * a diagram is not shown with lines missing or as bare source: on Paseo 0.13 and
 * newer through Paseo's Markdown inside the plugin's message, on 0.11 and 0.12 by
 * leaving the whole message to Paseo. The parsers decide, not a guess from the
 * first word: a line either parser reports as skipped is a line this plugin would
 * not draw.
 *
 * `pending` is the line being typed while the diagram can still grow, and null once
 * it cannot. Only `finished` lines are judged while it grows, so a half-typed edge
 * never hands the diagram over and takes it back a moment later, and a diagram with
 * nothing to draw yet is kept. Finished lines never change, so for one diagram the
 * answer only ever moves from this plugin to Mermaid, and the renderer swaps at most
 * once. Without skew a slanted shape counts once any finished line has given it,
 * even if a later line gives that node another shape, for the same reason.
 */
export function drawable(finished: string, pending: string | null, options: DrawableOptions = {}): boolean {
  const skew = options.skew ?? true;
  const growing = pending !== null;
  const flow = parseFlowchart(finished);
  if (flow) {
    if (!skew && flow.shapes.some((shape) => SLANTED.has(shape))) return false;
    return flow.skipped.length === 0 && (growing || flow.nodes.length > 0);
  }
  const sequence = parseSequence(finished);
  if (sequence) return sequence.skipped.length === 0 && (growing || sequence.participants.length > 0);

  // No parser takes the finished lines. That is final unless nothing has finished yet.
  if (!growing || meaningful(finished)) return false;
  return couldStillName(uncommented(pending));
}

function uncommented(line: string): string {
  return line.replace(/%%.*$/, "").trim();
}

function meaningful(text: string): boolean {
  return text.split("\n").some((line) => uncommented(line).length > 0);
}

/** True while the first line, still arriving, can become a header this plugin draws. */
function couldStillName(line: string): boolean {
  // A lone `%` may be the start of a `%%` comment, which `uncommented` empties.
  if ("%%".startsWith(line)) return true;
  const typed = line.toLowerCase();
  return DRAWN.some((keyword) => {
    const known = keyword.toLowerCase();
    return known.startsWith(typed) || typed.startsWith(known);
  });
}
