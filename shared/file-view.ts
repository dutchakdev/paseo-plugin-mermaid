import { drawable } from "./drawable";

export type FileView = { kind: "empty" } | { kind: "diagram"; source: string } | { kind: "markdown"; markdown: string };

/**
 * What the file panel shows for a `.mmd` file: the plugin's drawing when it draws
 * the whole diagram, otherwise a mermaid fence for Paseo's Markdown, which renders
 * the diagram with Mermaid itself. The file is complete, so nothing is still arriving.
 */
export function fileView(text: string): FileView {
  const source = text.trim();
  if (source.length === 0) return { kind: "empty" };
  if (drawable(source, false)) return { kind: "diagram", source };
  // A fence closes on a run of backticks at least as long as its own, so it must
  // be longer than any run inside the source.
  const longest = Math.max(2, ...(source.match(/`+/g) ?? []).map((run) => run.length));
  const fence = "`".repeat(longest + 1);
  return { kind: "markdown", markdown: `${fence}mermaid\n${source}\n${fence}` };
}
