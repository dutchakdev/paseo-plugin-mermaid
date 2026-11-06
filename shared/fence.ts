/**
 * Wraps Mermaid source in a fence for Paseo's Markdown, which renders the diagram
 * with Mermaid itself. A fence closes on a run of backticks at least as long as its
 * own, so it must be longer than any run inside the source.
 */
export function mermaidFence(source: string): string {
  const longest = Math.max(2, ...(source.match(/`+/g) ?? []).map((run) => run.length));
  const fence = "`".repeat(longest + 1);
  return `${fence}mermaid\n${source}\n${fence}`;
}
