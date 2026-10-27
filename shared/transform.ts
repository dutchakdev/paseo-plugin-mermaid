import type { PluginTimelineItem } from "@getpaseo/plugin";
import { drawable } from "./drawable";
import { segmentMessage } from "./segment";

export const DIAGRAM_KIND = "mermaid-diagram";
export const TEXT_KIND = "mermaid-text";

/**
 * Turns one message into the items this plugin renders, or leaves it alone.
 *
 * Pure and synchronous because Paseo reruns transformers while reconciling
 * projected history, and because it is the part worth testing.
 */
export function split(text: string, phase: "streaming" | "complete"): { items: PluginTimelineItem[] } | undefined {
  const segments = segmentMessage(text);
  // Leave the entry alone unless there is a diagram to draw: Paseo renders
  // ordinary Markdown better than this plugin does.
  const diagrams = segments.filter((segment) => segment.kind === "mermaid");
  if (diagrams.length === 0) return undefined;
  // One diagram the plugin cannot draw in full leaves the whole message to Paseo,
  // which draws every diagram in it with Mermaid itself.
  // While the message streams, an open fence can still grow; once it is complete,
  // every line is final, including the last line of a fence that never closed.
  const growing = phase === "streaming";
  const judged = diagrams.every((diagram) =>
    growing && diagram.pending !== null ? drawable(diagram.finished, diagram.pending) : drawable(diagram.source, null),
  );
  if (!judged) return undefined;
  // Reference links and footnotes resolve across the whole message; split, they would not.
  if (segments.some((segment) => segment.kind === "text" && hasDefinition(segment.text))) return undefined;

  // Pushed one branch at a time rather than mapped through a ternary: a ternary
  // produces a union of the two shapes, and TypeScript gives the absent members
  // `?: undefined`, which the JSON-only item type rejects. `push` type-checks
  // each literal on its own.
  const items: PluginTimelineItem[] = [];
  for (const segment of segments) {
    if (segment.kind === "mermaid") {
      items.push({ type: "plugin", kind: DIAGRAM_KIND, version: 1, data: { source: segment.source } });
    } else {
      items.push({ type: "plugin", kind: TEXT_KIND, version: 1, data: { text: segment.text } });
    }
  }
  return { items };
}

/**
 * True when the text holds anything shaped like a link reference definition or a
 * footnote: a bracketed label, then a colon, anywhere. CommonMark allows definitions
 * in list items and blockquotes and labels that span lines, so matching only
 * well-formed ones at a line start misses real ones. Splitting the message would put
 * a definition in a different Markdown document from its link; a false match, such
 * as `a[i]:` in code, only costs the plugin's drawing, since Paseo renders the message.
 *
 * A scan rather than `/\[[^\]]+\]:/`: that regex backtracks quadratically on a long
 * run of `[`, and this runs in the app on every streaming update. Each `]:` looks
 * back only to the nearest bracket, so the work stays linear.
 */
function hasDefinition(text: string): boolean {
  for (let end = text.indexOf("]:"); end >= 0; end = text.indexOf("]:", end + 2)) {
    for (let at = end - 1; at >= 0; at -= 1) {
      if (text[at] === "]") break;
      if (text[at] === "[") {
        if (at < end - 1) return true;
        break;
      }
    }
  }
  return false;
}
