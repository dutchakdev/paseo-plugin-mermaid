import { describe, expect, it } from "vitest";
import { DIAGRAM_KIND, split, TEXT_KIND } from "../shared/transform";

const DIAGRAM = "```mermaid\nflowchart TD\n  A --> B\n```";

describe("split", () => {
  it("leaves an ordinary message alone, so Paseo keeps rendering it", () => {
    // Taking over a plain message would replace Paseo's Markdown with a worse one.
    expect(split("Just some prose with `code` and **bold**.")).toBeUndefined();
    expect(split("```ts\nconst a = 1;\n```")).toBeUndefined();
  });

  it("keeps the prose on both sides of a diagram", () => {
    const result = split(`Before\n\n${DIAGRAM}\n\nAfter`);
    expect(result?.items.map((item) => item.kind)).toEqual([TEXT_KIND, DIAGRAM_KIND, TEXT_KIND]);
  });

  it("stores the Mermaid source rather than a parsed graph", () => {
    const result = split(DIAGRAM);
    expect(result?.items[0].data).toEqual({ source: "flowchart TD\n  A --> B" });
  });

  it("emits data that survives a JSON round trip", () => {
    // Paseo validates item data as JSON before rendering.
    const result = split(`text\n${DIAGRAM}`);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it("handles a message that is only a diagram", () => {
    expect(split(DIAGRAM)?.items).toHaveLength(1);
  });

  it("handles several diagrams in one message", () => {
    const result = split(`${DIAGRAM}\n\nand\n\n${DIAGRAM}`);
    expect(result?.items.filter((item) => item.kind === DIAGRAM_KIND)).toHaveLength(2);
  });

  it("is deterministic, because Paseo reruns it during reconciliation", () => {
    expect(split(`Before\n${DIAGRAM}`)).toEqual(split(`Before\n${DIAGRAM}`));
  });

  it("stamps every item with a version", () => {
    for (const item of split(DIAGRAM)?.items ?? []) expect(item.version).toBe(1);
  });
});
