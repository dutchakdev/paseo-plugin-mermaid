import type { PluginTimelineItem } from "@getpaseo/plugin";
import { classicShapes } from "./classic-shapes";
import { drawable } from "./drawable";
import { mermaidFence } from "./fence";
import { mapMermaidSources, type Segment, segmentMessage } from "./segment";

type MermaidSegment = Extract<Segment, { kind: "mermaid" }>;

export const DIAGRAM_KIND = "mermaid-diagram";
export const TEXT_KIND = "mermaid-text";

export interface SplitOptions {
  /**
   * Whether the app has Paseo's own Markdown (0.13 and later), which draws every
   * Mermaid diagram type. Then no message with a diagram is left to Paseo: what this
   * plugin cannot draw goes to that Markdown as a mermaid fence inside the plugin's
   * own text item. Off by default, which leaves such a message to Paseo.
   */
  hostMarkdown?: boolean;
  /** Whether the app can shear a View; see `DrawableOptions`. True by default. */
  skew?: boolean;
}

/**
 * Turns one message into the items this plugin renders, or leaves it alone.
 *
 * Pure and synchronous because Paseo reruns transformers while reconciling
 * projected history, and because it is the part worth testing.
 */
export function split(
  text: string,
  phase: "streaming" | "complete",
  options: SplitOptions = {},
): { items: PluginTimelineItem[] } | undefined {
  const hostMarkdown = options.hostMarkdown ?? false;
  const judge = { skew: options.skew ?? true };
  const segments = segmentMessage(text);
  // Leave the entry alone unless there is a diagram to draw: Paseo renders
  // ordinary Markdown better than this plugin does.
  const diagrams = segments.filter((segment) => segment.kind === "mermaid");
  if (diagrams.length === 0) return undefined;
  // While the message streams, an open fence can still grow; once it is complete,
  // every line is final, including the last line of a fence that never closed.
  const growing = phase === "streaming";
  const drawn = (diagram: MermaidSegment) =>
    growing && diagram.pending !== null
      ? drawable(diagram.finished, diagram.pending, judge)
      : drawable(diagram.source, null, judge);
  // Reference links and footnotes resolve across the whole message; split, they would not.
  const defined = segments.some((segment) => segment.kind === "text" && hasDefinition(segment.text));

  if (hostMarkdown) {
    // Paseo's Markdown reads the message in one piece, so the definition finds its link
    // and it draws the message's diagrams itself, every one of them, so each is written
    // the way its Mermaid accepts. Nothing but the mermaid fences' bodies changes.
    if (defined) {
      const whole = mapMermaidSources(text, classicShapes);
      return { items: [{ type: "plugin", kind: TEXT_KIND, version: 1, data: { text: whole } }] };
    }
  } else {
    // One diagram the plugin cannot draw in full leaves the whole message to Paseo,
    // which draws every diagram in it with Mermaid itself.
    if (!diagrams.every(drawn)) return undefined;
    if (defined) return undefined;
  }

  // Pushed one branch at a time rather than mapped through a ternary: a ternary
  // produces a union of the two shapes, and TypeScript gives the absent members
  // `?: undefined`, which the JSON-only item type rejects. `push` type-checks
  // each literal on its own.
  const items: PluginTimelineItem[] = [];
  for (const segment of segments) {
    if (segment.kind === "text") {
      items.push({ type: "plugin", kind: TEXT_KIND, version: 1, data: { text: segment.text } });
    } else if (!hostMarkdown || drawn(segment)) {
      // Without Paseo's Markdown every diagram was judged drawable above.
      items.push({ type: "plugin", kind: DIAGRAM_KIND, version: 1, data: { source: segment.source } });
    } else {
      items.push({ type: "plugin", kind: TEXT_KIND, version: 1, data: { text: mermaidFence(classicShapes(segment.source)) } });
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
