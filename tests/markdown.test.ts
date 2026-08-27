import { describe, expect, it } from "vitest";
import { parseInline, parseMarkdown } from "../markdown.shared";

describe("parseInline", () => {
  it("reads bold, italic and code", () => {
    expect(parseInline("a **b** c `d` e *f*")).toEqual([
      { kind: "text", text: "a " },
      { kind: "bold", text: "b" },
      { kind: "text", text: " c " },
      { kind: "code", text: "d" },
      { kind: "text", text: " e " },
      { kind: "italic", text: "f" },
    ]);
  });

  it("leaves an unmatched marker as text rather than eating the rest", () => {
    expect(parseInline("2 * 3 = 6")).toEqual([{ kind: "text", text: "2 * 3 = 6" }]);
  });

  it("does not read emphasis inside code", () => {
    expect(parseInline("`a **b**`")).toEqual([{ kind: "code", text: "a **b**" }]);
  });
});

describe("parseMarkdown", () => {
  it("reads headings with their level", () => {
    expect(parseMarkdown("### Title")[0]).toMatchObject({ kind: "heading", level: 3 });
  });

  it("joins wrapped lines into one paragraph", () => {
    const blocks = parseMarkdown("one\ntwo\n\nthree");
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({ kind: "paragraph" });
  });

  it("groups consecutive bullets into a single list", () => {
    const blocks = parseMarkdown("- a\n- b\n- c");
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ kind: "bullet" });
    expect((blocks[0] as { items: unknown[] }).items).toHaveLength(3);
  });

  it("keeps the starting number of an ordered list", () => {
    expect(parseMarkdown("3. third\n4. fourth")[0]).toMatchObject({ kind: "ordered", start: 3 });
  });

  it("keeps a fenced block verbatim, including its blank lines", () => {
    const blocks = parseMarkdown("```ts\nconst a = 1;\n\nconst b = 2;\n```");
    expect(blocks[0]).toMatchObject({ kind: "code", language: "ts" });
    expect((blocks[0] as { text: string }).text).toContain("\n\n");
  });

  it("does not treat a list inside a code block as a list", () => {
    const blocks = parseMarkdown("```\n- not a bullet\n```");
    expect(blocks).toHaveLength(1);
    expect(blocks[0].kind).toBe("code");
  });

  it("reads a rule and a quote", () => {
    expect(parseMarkdown("---")[0]).toMatchObject({ kind: "rule" });
    expect(parseMarkdown("> quoted")[0]).toMatchObject({ kind: "quote" });
  });

  it("returns nothing for empty input", () => {
    expect(parseMarkdown("   \n\n  ")).toEqual([]);
  });
});
