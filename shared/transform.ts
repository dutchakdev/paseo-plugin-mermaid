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
  if (segments.some((segment) => segment.kind === "text" && DEFINITION.test(segment.text))) return undefined;

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
 * A line that starts a link reference definition or a footnote, inside a
 * blockquote too. Splitting the message would put it in a different Markdown
 * document from the link that uses it. Lines inside code blocks match as well;
 * leaving such a message to Paseo costs nothing but the plugin's drawing.
 */
const DEFINITION = /^[ \t]*(?:>[ \t]*)*\[[^\]\n]+\]:/m;
