import { describe, expect, it } from "vitest";
import { classicShapes } from "../shared/classic-shapes";
import { parseFlowchart, parseNodeExpression } from "../shared/flowchart";
import { SHAPE_NAMES } from "./shape-names";

describe("classicShapes", () => {
  it("rewrites a shape object into bracket syntax", () => {
    expect(classicShapes('flowchart LR\n  A@{ shape: cyl, label: "Orders DB" } --> B')).toBe(
      'flowchart LR\n  A[("Orders DB")] --> B',
    );
  });

  it("uses the id as the label when the object gives none", () => {
    expect(classicShapes("A@{ shape: hex }")).toBe('A{{"A"}}');
    expect(classicShapes('node-1.a@{ shape: db, label: "" }')).toBe('node-1.a[("node-1.a")]');
  });

  it("rewrites every object on a line, wherever the node sits in the chain", () => {
    expect(classicShapes('A@{ shape: db, label: "one" } -->|yes| B@{ shape: hex, label: "two" } --> C@{ shape: circ }')).toBe(
      'A[("one")] -->|yes| B{{"two"}} --> C(("C"))',
    );
    expect(classicShapes("A@{ shape: db } & B@{ shape: hex }; C@{ shape: diam }")).toBe(
      'A[("A")] & B{{"B"}}; C{"C"}',
    );
  });

  it("reads single-quoted and unquoted values, either order, and keeps <br/> for Mermaid", () => {
    expect(classicShapes("A@{ label: Orders, shape: db }")).toBe('A[("Orders")]');
    expect(classicShapes("A@{ shape: 'db', label: 'Orders' }")).toBe('A[("Orders")]');
    expect(classicShapes('A@{ shape: db, label: "one<br/>two, three: {four}" }')).toBe('A[("one<br/>two, three: {four}")]');
  });

  it("takes an operator that looks like part of an id for what it is", () => {
    expect(classicShapes("A---B@{ shape: db }")).toBe('A---B[("B")]');
    expect(classicShapes("A-.->B@{ shape: db }")).toBe('A-.->B[("B")]');
    expect(classicShapes("A==>B@{ shape: db }")).toBe('A==>B[("B")]');
    expect(classicShapes("A--oB@{ shape: db }")).toBe('A--oB[("B")]');
  });

  it("closes the gap between an id and its object, as the parser reads a spaced id", () => {
    expect(classicShapes('A --> B  @{ shape: db, label: "x" }')).toBe('A --> B[("x")]');
  });

  // The bracket form of each shape name Mermaid 11 gives it, with a label and without.
  it.each([
    ["rect", "rect", '["Lbl"]'],
    ["process", "rect", '["Lbl"]'],
    ["rounded", "round", '("Lbl")'],
    ["stadium", "stadium", '(["Lbl"])'],
    ["fr-rect", "subroutine", '[["Lbl"]]'],
    ["cyl", "cylinder", '[("Lbl")]'],
    ["circle", "circle", '(("Lbl"))'],
    ["diam", "diamond", '{"Lbl"}'],
    ["hex", "hexagon", '{{"Lbl"}}'],
    ["lean-r", "lean-right", '[/"Lbl"/]'],
    ["lean-l", "lean-left", '[\\"Lbl"\\]'],
    ["trap-b", "trapezoid", '[/"Lbl"\\]'],
    ["trap-t", "trapezoid-top", '[\\"Lbl"/]'],
    ["dbl-circ", "double-circle", '((("Lbl")))'],
  ])("writes %s (%s) as %s", (name, _shape, bracket) => {
    expect(classicShapes(`A@{ shape: ${name}, label: "Lbl" }`)).toBe(`A${bracket}`);
    expect(classicShapes(`A@{ shape: ${name} }`)).toBe(`A${bracket.replace("Lbl", "A")}`);
  });

  it("writes a bracket form the parser reads back as the same node", () => {
    for (const [name, shape] of SHAPE_NAMES.flatMap(([shape, names]) => names.map((name) => [name, shape] as const))) {
      const source = `A@{ shape: ${name}, label: "Lbl" }`;
      expect(parseNodeExpression(classicShapes(source))).toEqual(parseNodeExpression(source));
      expect(parseNodeExpression(classicShapes(source))?.shape).toBe(shape);
    }
  });

  it.each([
    ["an unknown shape", "A@{ shape: cloud }"],
    ["an unknown shape with a label", 'A@{ shape: cloud, label: "x" }'],
    ["another key", 'A@{ shape: cyl, img: "x" }'],
    ["an icon", 'A@{ shape: cyl, icon: "fa:user", label: "x" }'],
    ["no shape", 'A@{ label: "x" }'],
    ["a repeated key", "A@{ shape: cyl, shape: hex }"],
    ["an upper-case shape name", "A@{ shape: Cyl }"],
    ["a double quote in a single-quoted label", "A@{ shape: cyl, label: 'a \"b\" c' }"],
    ["an escaped quote", 'A@{ shape: cyl, label: "a \\"b\\" c" }'],
    ["a Markdown string label", 'A@{ shape: cyl, label: "`**bold**`" }'],
    ["an unclosed object", "A@{ shape: cyl"],
    ["an unclosed quote", 'A@{ shape: cyl, label: "x }'],
    ["a trailing comma", "A@{ shape: cyl, }"],
    ["no id", "@{ shape: cyl }"],
    ["an id that is not one", "a b@{ shape: cyl }"],
    ["a bracket shape in front", "A[x]@{ shape: cyl }"],
  ])("leaves %s as it came", (_name, line) => {
    const source = `flowchart LR\n  ${line}\n  A --> B`;
    expect(classicShapes(source)).toBe(source);
  });

  it("leaves a source without @{ byte-identical", () => {
    const source = 'flowchart TD\n  A[Start] -->|go| B{{"x"}}\n  %% a comment\n\n  B --> C\r\n';
    expect(classicShapes(source)).toBe(source);
    expect(classicShapes("")).toBe("");
  });

  it("leaves an object it cannot hand over where it is, and still rewrites the others", () => {
    expect(classicShapes('A@{ shape: cloud } --> B@{ shape: db, label: "x" }')).toBe('A@{ shape: cloud } --> B[("x")]');
  });

  it("does not look inside an object it leaves alone for another node", () => {
    const source = 'A@{ shape: cloud, label: "x --> B@{ shape: db }" }';
    expect(classicShapes(source)).toBe(source);
  });

  it("does not touch a @{ inside a quoted label", () => {
    for (const line of [
      'A["see @{ shape: cyl }"] --> B',
      'A["see B@{ shape: cyl }"] --> C',
      'A("a @{ shape: cyl, label: x }")',
      'A -->|"see B@{ shape: cyl }"| C',
    ]) {
      expect(classicShapes(line)).toBe(line);
    }
  });

  it("does not touch a @{ in an edge label or a comment", () => {
    for (const line of [
      "A -->|see B@{ shape: cyl }| C",
      "A ==>|B@{ shape: cyl }| C",
      "A --> B %% C@{ shape: cyl }",
      "%% A@{ shape: cyl }",
      '%%{init: {"note": "A@{ shape: cyl }"}}%%',
    ]) {
      expect(classicShapes(line)).toBe(line);
    }
  });

  it("rewrites a node after a quoted label or an edge label, and before a comment", () => {
    expect(classicShapes('A["x @{ y }"] --> B@{ shape: db } %% C@{ shape: hex }')).toBe(
      'A["x @{ y }"] --> B[("B")] %% C@{ shape: hex }',
    );
    expect(classicShapes("A -->|yes| B@{ shape: db }")).toBe('A -->|yes| B[("B")]');
  });

  it("keeps every other line, in order, and the line breaks", () => {
    const source = "flowchart TD\n  subgraph S\n    A@{ shape: db }\n  end\n\n  A --> B\r\n  B@{ shape: hex }";
    expect(classicShapes(source)).toBe(
      'flowchart TD\n  subgraph S\n    A[("A")]\n  end\n\n  A --> B\r\n  B{{"B"}}',
    );
  });

  it("leaves no @{ in a diagram made only of readable objects", () => {
    const source = 'flowchart LR\n  A@{ shape: db, label: "Orders DB" } --> B@{ shape: hex }\n  B --> C@{ shape: lean-r, label: x }';
    expect(classicShapes(source)).not.toContain("@{");
  });
});

describe("classicShapes keeping the label an earlier mention gave", () => {
  // Mermaid keeps a node's label when a later object gives none, so the bracket form must carry it.
  const lines = (...body: string[]) => ["flowchart LR", ...body.map((line) => `  ${line}`)].join("\n");

  it("writes the label a bracket mention gave before the object", () => {
    expect(classicShapes(lines("A[Orders] --> B", "A@{ shape: db }"))).toBe(lines("A[Orders] --> B", 'A[("Orders")]'));
    expect(classicShapes(lines("A[Orders] --> B", 'A@{ shape: db, label: "" }'))).toBe(lines("A[Orders] --> B", 'A[("Orders")]'));
  });

  it("writes the id when the label only comes after the object, where that later mention gives it", () => {
    expect(classicShapes(lines("A@{ shape: db } --> B", "A[Orders]"))).toBe(lines('A[("A")] --> B', "A[Orders]"));
  });

  it("writes the id when no mention gave a label", () => {
    expect(classicShapes(lines("A --> B", "A@{ shape: db }"))).toBe(lines("A --> B", 'A[("A")]'));
  });

  it("takes the last label given, by a bracket or by an object", () => {
    expect(classicShapes(lines("A[one] --> B", "A(two)", "A@{ shape: db }"))).toBe(lines("A[one] --> B", "A(two)", 'A[("two")]'));
    expect(classicShapes(lines('A@{ shape: hex, label: "Orders" } --> B', "A@{ shape: db }"))).toBe(
      lines('A{{"Orders"}} --> B', 'A[("Orders")]'),
    );
  });

  it("keeps each node's label to itself", () => {
    expect(classicShapes(lines("A[x] --> B[y]", "B@{ shape: db }"))).toBe(lines("A[x] --> B[y]", 'B[("y")]'));
  });

  it("counts a label given earlier on the same line", () => {
    expect(classicShapes(lines("A[Orders] --> B --> A@{ shape: db }"))).toBe(lines('A[Orders] --> B --> A[("Orders")]'));
  });

  it("reads the node in front of an edge label written between the dashes", () => {
    expect(classicShapes(lines("Q{Ready?} -- yes --> B", "Q@{ shape: hex }"))).toBe(lines("Q{Ready?} -- yes --> B", 'Q{{"Ready?"}}'));
  });

  it("reads a label on a line that runs nodes together with &", () => {
    expect(classicShapes(lines("A[Orders] & B --> C", "A@{ shape: db }"))).toBe(lines("A[Orders] & B --> C", 'A[("Orders")]'));
  });

  it("writes an earlier label's line breaks back as <br/> for Mermaid", () => {
    expect(classicShapes(lines("A[one<br/>two] --> B", "A@{ shape: db }"))).toBe(lines("A[one<br/>two] --> B", 'A[("one<br/>two")]'));
  });

  it("leaves the object as it came when the earlier label holds a double quote, which a bracket label cannot", () => {
    const source = lines("A['say \"hi\"'] --> B", "A@{ shape: db }");
    expect(classicShapes(source)).toBe(source);
  });

  it("does not take a label from a comment or from an edge label", () => {
    expect(classicShapes(lines("B --> C %% A[Orders]", "A@{ shape: db }"))).toBe(lines("B --> C %% A[Orders]", 'A[("A")]'));
    expect(classicShapes(lines("B -->|A[Orders]| C", "A@{ shape: db }"))).toBe(lines("B -->|A[Orders]| C", 'A[("A")]'));
  });

  it.each([
    ["a bracket label before the object", lines("A[Orders] --> B", "A@{ shape: db }")],
    ["an object's label before another object", lines('A@{ shape: hex, label: "Orders" } --> B', "A@{ shape: db }")],
    ["a label after the object", lines("A@{ shape: db } --> B", "A[Orders]")],
    ["no label at all", lines("A --> B", "A@{ shape: db }")],
  ])("leaves the parser reading the same nodes after %s", (_name, source) => {
    expect(parseFlowchart(classicShapes(source))?.nodes).toEqual(parseFlowchart(source)?.nodes);
  });
});
