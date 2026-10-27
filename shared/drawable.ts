import { parseFlowchart } from "./flowchart";
import { parseSequence } from "./sequence";

/** Diagram keywords whose diagrams this plugin draws, in Mermaid's spelling. */
const DRAWN = ["flowchart", "graph", "sequenceDiagram"];

/**
 * Whether this plugin draws everything in a diagram.
 *
 * When it does not, the message is left to Paseo, whose own renderer runs Mermaid
 * and draws every diagram type, so a diagram is not shown with lines missing or as
 * bare source. The parsers decide, not a guess from the first word: a line either
 * parser reports as skipped is a line this plugin would not draw.
 *
 * `pending` is the line being typed while the diagram can still grow, and null once
 * it cannot. Only `finished` lines are judged while it grows, so a half-typed edge
 * never hands the message over and takes it back a moment later, and a diagram with
 * nothing to draw yet is kept. Finished lines never change, so for one diagram the
 * answer only ever moves from this plugin to Paseo, and the renderer swaps at most
 * once.
 */
export function drawable(finished: string, pending: string | null): boolean {
  const growing = pending !== null;
  const flow = parseFlowchart(finished);
  if (flow) return flow.skipped.length === 0 && (growing || flow.nodes.length > 0);
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
  const typed = line.toLowerCase();
  return DRAWN.some((keyword) => {
    const known = keyword.toLowerCase();
    return known.startsWith(typed) || typed.startsWith(known);
  });
}
