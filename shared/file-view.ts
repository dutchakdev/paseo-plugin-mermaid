import { type DrawableOptions, drawable } from "./drawable";
import { mermaidFence } from "./fence";

export type FileView = { kind: "empty" } | { kind: "diagram"; source: string } | { kind: "markdown"; markdown: string };

/**
 * What the file panel shows for a `.mmd` file: the plugin's drawing when it draws
 * the whole diagram, otherwise a mermaid fence for Paseo's Markdown, which renders
 * the diagram with Mermaid itself. The file is complete, so nothing is still arriving.
 */
export function fileView(text: string, options: DrawableOptions = {}): FileView {
  const source = text.trim();
  if (source.length === 0) return { kind: "empty" };
  if (drawable(source, null, options)) return { kind: "diagram", source };
  return { kind: "markdown", markdown: mermaidFence(source) };
}
