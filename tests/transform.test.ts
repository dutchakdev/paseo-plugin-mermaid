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

  it("counts a streamed line as finished once its newline has arrived, whatever follows it", () => {
    const finished = "```mermaid\nflowchart LR\n  A --> B\n  subgraph api\n";
    expect(split(finished, "streaming")).toBeUndefined();
    // A space typed after the newline must not make the subgraph line pending again and take the message back.
    expect(split(`${finished} `, "streaming")).toBeUndefined();
    expect(split(`${finished}  B`, "streaming")).toBeUndefined();
  });

  it("keeps a streamed diagram whose header has just ended, rather than hand it over and take it back", () => {
    expect(split("```mermaid\nflowchart TD\n", "streaming")?.items.map((item) => item.kind)).toEqual([DIAGRAM_KIND]);
  });

  it.each([
    ["a reference link defined on the other side of the diagram", `See [Guide][guide].\n\n${DIAGRAM}\n\n[guide]: https://paseo.sh/docs`],
    ["a definition whose destination is on the next line", `See [Guide][guide].\n\n${DIAGRAM}\n\n[guide]:\n  https://paseo.sh/docs`],
    ["a definition inside a blockquote", `${DIAGRAM}\n\n> [guide]: https://paseo.sh/docs`],
    ["a footnote", `Note[^1]\n\n${DIAGRAM}\n\n[^1]: Footnote.`],
    ["a definition whose label spans lines", `See [Guide][guide].\n\n${DIAGRAM}\n\n[\nguide\n]: /guide`],
    ["a definition inside a list item", `See [Guide][guide].\n\n${DIAGRAM}\n\n- [guide]: /guide`],
  ])("leaves a message with %s to Paseo, which resolves it across the whole message", (_name, text) => {
    // Each prose item is a Markdown document of its own, so a definition in one would not reach a link in another.
    expect(split(text, "complete")).toBeUndefined();
  });

  it("decides in linear time, since it runs in the app on every streaming update", () => {
    // 40,000 `[` without a `]` took 2.4 s through a backtracking regex; a linear scan takes milliseconds.
    const hostile = `${"[".repeat(40_000)}\n\n${DIAGRAM}`;
    const started = performance.now();
    split(hostile, "streaming");
    expect(performance.now() - started).toBeLessThan(500);
  });

  it("is deterministic, because Paseo reruns it during reconciliation", () => {
    expect(split(`Before\n${DIAGRAM}`, "complete")).toEqual(split(`Before\n${DIAGRAM}`, "complete"));
  });

  it("stamps every item with a version", () => {
    for (const item of split(DIAGRAM, "complete")?.items ?? []) expect(item.version).toBe(1);
  });
});
