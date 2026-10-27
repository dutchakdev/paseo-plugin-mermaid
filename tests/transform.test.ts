import { describe, expect, it } from "vitest";
import { DIAGRAM_KIND, split, TEXT_KIND } from "../shared/transform";

const DIAGRAM = "```mermaid\nflowchart TD\n  A --> B\n```";

describe("split", () => {
  it("leaves an ordinary message alone, so Paseo keeps rendering it", () => {
    // Taking over a plain message would replace Paseo's Markdown with a worse one.
    expect(split("Just some prose with `code` and **bold**.", "complete")).toBeUndefined();
    expect(split("```ts\nconst a = 1;\n```", "complete")).toBeUndefined();
  });

  it("keeps the prose on both sides of a diagram", () => {
    const result = split(`Before\n\n${DIAGRAM}\n\nAfter`, "complete");
    expect(result?.items.map((item) => item.kind)).toEqual([TEXT_KIND, DIAGRAM_KIND, TEXT_KIND]);
  });

  it("stores the Mermaid source rather than a parsed graph", () => {
    const result = split(DIAGRAM, "complete");
    expect(result?.items[0].data).toEqual({ source: "flowchart TD\n  A --> B" });
  });

  it("emits data that survives a JSON round trip", () => {
    // Paseo validates item data as JSON before rendering.
    const result = split(`text\n${DIAGRAM}`, "complete");
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it("handles a message that is only a diagram", () => {
    expect(split(DIAGRAM, "complete")?.items).toHaveLength(1);
  });

  it("handles several diagrams in one message", () => {
    const result = split(`${DIAGRAM}\n\nand\n\n${DIAGRAM}`, "complete");
    expect(result?.items.filter((item) => item.kind === DIAGRAM_KIND)).toHaveLength(2);
  });

  it("leaves a message to Paseo when a diagram in it has lines the plugin would not draw", () => {
    // Paseo's renderer runs Mermaid itself and draws subgraphs; the plugin would drop them.
    const subgraph = "```mermaid\nflowchart LR\n  subgraph api\n    A --> B\n  end\n```";
    expect(split(`See:\n\n${subgraph}`, "complete")).toBeUndefined();
    expect(split(`${DIAGRAM}\n\nand\n\n${subgraph}`, "complete")).toBeUndefined();
  });

  it("leaves a diagram type the plugin does not draw to Paseo instead of showing its source", () => {
    expect(split("```mermaid\ngantt\n  title Release\n```", "complete")).toBeUndefined();
  });

  it("keeps a diagram that is still arriving with a half-typed last line", () => {
    const result = split("Here:\n\n```mermaid\nflowchart TD\n  A --> B\n  B -", "streaming");
    expect(result?.items.map((item) => item.kind)).toEqual([TEXT_KIND, DIAGRAM_KIND]);
  });

  it("judges every line of a finished message, even one whose fence never closed", () => {
    // History holds messages that ended mid-fence; nothing more will arrive, so the last line counts.
    expect(split("```mermaid\nflowchart TD\n  A --> B\n  classDef red fill:#f00\n", "complete")).toBeUndefined();
    expect(split("```mermaid\nflowchart TD\n  A --> B\n  classDef red fill:#f00", "complete")).toBeUndefined();
  });

  it("counts a streamed line as finished once its newline has arrived", () => {
    expect(split("```mermaid\nflowchart LR\n  A --> B\n  subgraph api\n", "streaming")).toBeUndefined();
  });

  it("gives every prose item the message's link definitions, so a reference link still resolves across a diagram", () => {
    // Each prose item is its own Markdown document; `[Guide][guide]` above the diagram needs the definition below it.
    const result = split(`See [Guide][guide].\n\n${DIAGRAM}\n\n[guide]: https://paseo.sh/docs`, "complete");
    const prose = result?.items.filter((item) => item.kind === TEXT_KIND).map((item) => item.data);
    expect(prose).toEqual([
      { text: "See [Guide][guide].", definitions: "[guide]: https://paseo.sh/docs" },
      { text: "[guide]: https://paseo.sh/docs", definitions: "[guide]: https://paseo.sh/docs" },
    ]);
  });

  it("does not take definitions from code blocks, or footnotes, whose list would repeat under every item", () => {
    const result = split(`\`\`\`md\n[x]: https://example.com\n\`\`\`\n\nNote[^1]\n\n[^1]: Footnote.\n\n${DIAGRAM}`, "complete");
    for (const item of result?.items ?? []) expect(item.data).not.toHaveProperty("definitions");
  });

  it("is deterministic, because Paseo reruns it during reconciliation", () => {
    expect(split(`Before\n${DIAGRAM}`, "complete")).toEqual(split(`Before\n${DIAGRAM}`, "complete"));
  });

  it("stamps every item with a version", () => {
    for (const item of split(DIAGRAM, "complete")?.items ?? []) expect(item.version).toBe(1);
  });
});
