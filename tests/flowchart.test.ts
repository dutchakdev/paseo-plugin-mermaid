import { describe, expect, it } from "vitest";
import {
  normalizeEdgeLabels,
  parseFlowchart,
  parseNodeExpression,
  shapeFromName,
  splitChain,
  type NodeShape,
} from "../shared/flowchart";

describe("parseNodeExpression", () => {
  it.each([
    ["two nodes run together with &", "A[one] & B[two]"],
    ["two statements run together with ;", "A[one]; B[two]"],
    ["a Markdown string label", 'A["`**bold**`"]'],
    ["quoted nodes run together with &", 'A["one"] & B["two"]'],
    ["round nodes run together with ;", "A(one); B(two)"],
    ["a round shape nested in a hexagon", "A{{(x)}}"],
    ["a slash-wrapped label nested in a cylinder", "A[(/x/)]"],
    ["a round shape nested in a parallelogram", "A[/(x)/]"],
    ["hexagons run together with &", "A{{a}} & B{{b}}"],
    ["double circles run together with ;", "A(((a))); B(((b)))"],
    ["cylinders run together with &", "A[(a)] & B[(b)]"],
    ["parallelograms run together with &", "A[/a/] & B[/b/]"],
  ])("refuses %s rather than draw it wrong", (_name, expression) => {
    // Accepted, each would come out as a box with stray brackets in its label, so it must count as skipped.
    expect(parseNodeExpression(expression)).toBeNull();
  });

  it.each([
    ["a cylinder", "A[(db)]", "cylinder", "db"],
    ["a hexagon", "A{{hex}}", "hexagon", "hex"],
    ["a parallelogram leaning right", "A[/in/]", "lean-right", "in"],
    ["a parallelogram leaning left", "A[\\out\\]", "lean-left", "out"],
    ["a trapezoid", "A[/base\\]", "trapezoid", "base"],
    ["an upside-down trapezoid", "A[\\top/]", "trapezoid-top", "top"],
    ["a double circle", "A(((done)))", "double-circle", "done"],
    ["a cylinder with a line break", "A[(db<br/>wal)]", "cylinder", "db\nwal"],
  ])("reads %s", (_name, expression, shape, label) => {
    expect(parseNodeExpression(expression)).toEqual({ id: "A", label, shape });
  });

  it("refuses a label wrapped whole in another shape inside a new one", () => {
    expect(parseNodeExpression("A[([x])]")).toBeNull();
  });

  it("keeps brackets inside a quoted label", () => {
    expect(parseNodeExpression('A["list [x]"]')).toMatchObject({ id: "A", label: "list [x]", shape: "rect" });
  });

  it("keeps parentheses inside an unquoted label, which agents write often", () => {
    expect(parseNodeExpression("A[Reload (beta)]")).toMatchObject({ id: "A", label: "Reload (beta)", shape: "rect" });
  });

  it("reads every bracket shape Mermaid defines", () => {
    expect(parseNodeExpression("A[Rect]")).toMatchObject({ id: "A", label: "Rect", shape: "rect" });
    expect(parseNodeExpression("B(Round)")).toMatchObject({ shape: "round" });
    expect(parseNodeExpression("C([Stadium])")).toMatchObject({ shape: "stadium" });
    expect(parseNodeExpression("D[[Sub]]")).toMatchObject({ shape: "subroutine" });
    expect(parseNodeExpression("E{Decision}")).toMatchObject({ shape: "diamond" });
    expect(parseNodeExpression("F((Circle))")).toMatchObject({ shape: "circle" });
  });

  it("falls back to the id when a node carries no label", () => {
    expect(parseNodeExpression("start")).toMatchObject({ id: "start", label: "start", shape: "rect" });
  });

  it("strips quotes, which Mermaid needs for labels containing punctuation", () => {
    expect(parseNodeExpression('A["a, b and c"]')?.label).toBe("a, b and c");
  });

  it("turns <br/> into a real line break", () => {
    expect(parseNodeExpression("A[first<br/>second]")?.label).toBe("first\nsecond");
  });

  it("rejects something that is not a node", () => {
    expect(parseNodeExpression("")).toBeNull();
    expect(parseNodeExpression("has spaces in id")).toBeNull();
  });
});

/** Mermaid 11.16 short names and aliases for the shapes the plugin draws. */
const SHAPE_NAMES: [NodeShape, string[]][] = [
  ["rect", ["rect", "proc", "process", "rectangle"]],
  ["round", ["rounded", "event"]],
  ["stadium", ["stadium", "terminal", "pill"]],
  ["subroutine", ["fr-rect", "subprocess", "subproc", "framed-rectangle", "subroutine"]],
  ["cylinder", ["cyl", "db", "database", "cylinder"]],
  ["circle", ["circle", "circ"]],
  ["diamond", ["diam", "decision", "diamond", "question"]],
  ["hexagon", ["hex", "hexagon", "prepare"]],
  ["lean-right", ["lean-r", "lean-right", "in-out"]],
  ["lean-left", ["lean-l", "lean-left", "out-in"]],
  ["trapezoid", ["trap-b", "priority", "trapezoid-bottom", "trapezoid"]],
  ["trapezoid-top", ["trap-t", "manual", "trapezoid-top", "inv-trapezoid"]],
  ["double-circle", ["dbl-circ", "double-circle"]],
];

describe("shapeFromName", () => {
  it.each(SHAPE_NAMES.flatMap(([shape, names]) => names.map((name) => [name, shape] as const)))(
    "maps %s to %s",
    (name, shape) => {
      expect(shapeFromName(name)).toBe(shape);
    },
  );

  it("returns null for a name the plugin does not draw, or one Mermaid spells differently", () => {
    expect(shapeFromName("cloud")).toBeNull();
    expect(shapeFromName("Cyl")).toBeNull();
    expect(shapeFromName("constructor")).toBeNull();
    expect(shapeFromName("")).toBeNull();
  });
});

describe("parseNodeExpression shape objects", () => {
  it("reads a shape object", () => {
    expect(parseNodeExpression('A@{ shape: cyl, label: "Orders DB" }')).toEqual({
      id: "A",
      label: "Orders DB",
      shape: "cylinder",
    });
  });

  it("uses the id as the label when the object has none", () => {
    expect(parseNodeExpression("A@{ shape: cyl }")).toEqual({ id: "A", label: "A", shape: "cylinder" });
    expect(parseNodeExpression('A@{ shape: cyl, label: "" }')).toEqual({ id: "A", label: "A", shape: "cylinder" });
  });

  it("reads unquoted, single-quoted and double-quoted values, in either order", () => {
    expect(parseNodeExpression("A@{ shape: db, label: Orders }")).toMatchObject({ label: "Orders", shape: "cylinder" });
    expect(parseNodeExpression("A@{ label: Orders DB, shape: db }")).toMatchObject({ label: "Orders DB" });
    expect(parseNodeExpression("A@{ shape: 'db', label: 'Orders' }")).toMatchObject({ label: "Orders", shape: "cylinder" });
    expect(parseNodeExpression('A@{ shape: "db", label: "Orders" }')).toMatchObject({ label: "Orders", shape: "cylinder" });
    expect(parseNodeExpression("A@{shape: db,label: x}")).toMatchObject({ label: "x", shape: "cylinder" });
  });

  it("lets a quoted label hold the characters that would end an unquoted one", () => {
    expect(parseNodeExpression('A@{ shape: hex, label: "x, y: z } w" }')?.label).toBe("x, y: z } w");
    expect(parseNodeExpression('A@{ shape: hex, label: "a, b: {c}" }')?.label).toBe("a, b: {c}");
    expect(parseNodeExpression('A@{ shape: hex, label: "a --> b" }')?.label).toBe("a --> b");
    expect(parseNodeExpression("A@{ shape: hex, label: 'a, b: {c' }")?.label).toBe("a, b: {c");
  });

  it("turns <br/> into a line break and reads a node id with dots and dashes", () => {
    expect(parseNodeExpression('node-1.a@{ shape: db, label: "one<br/>two" }')).toEqual({
      id: "node-1.a",
      label: "one\ntwo",
      shape: "cylinder",
    });
  });

  it("reads a spaced id like the bracket shapes do", () => {
    expect(parseNodeExpression("A @{ shape: db }")).toMatchObject({ id: "A", shape: "cylinder" });
  });

  it.each([
    ["img", 'A@{ shape: cyl, img: "https://x.test/a.png" }'],
    ["icon", 'A@{ shape: cyl, icon: "fa:user" }'],
    ["pos", "A@{ shape: cyl, pos: b }"],
    ["constraint", "A@{ shape: cyl, constraint: on }"],
    ["w", "A@{ shape: cyl, w: 100 }"],
    ["h", "A@{ shape: cyl, h: 100 }"],
    ["form", "A@{ shape: cyl, form: square }"],
    ["an unknown shape", "A@{ shape: cloud }"],
    ["an unknown shape with a label", 'A@{ shape: cloud, label: "x" }'],
    ["an unclosed object", "A@{ shape: cyl"],
    ["an unclosed quote", 'A@{ shape: cyl, label: "x }'],
    ["a missing shape", 'A@{ label: "x" }'],
    ["an empty object", "A@{}"],
    ["an upper-case shape name", "A@{ shape: Cyl }"],
    ["a repeated key", "A@{ shape: cyl, shape: hex }"],
    ["a repeated label", 'A@{ shape: cyl, label: "a", label: "b" }'],
    ["a trailing comma", "A@{ shape: cyl, }"],
    ["a missing value", "A@{ shape: }"],
    ["a key without a colon", "A@{ shape cyl }"],
    ["no space after the colon", "A@{ shape:cyl }"],
    // Mermaid's lexer only treats `"` as a string: in a single-quoted value a `}` ends the object and a `"` opens a string that never closes.
    ["a } inside single quotes", "A@{ shape: hex, label: 'a, b: {c}' }"],
    ["a lone } inside single quotes", "A@{ shape: hex, label: 'a } b' }"],
    ["a double quote inside single quotes", "A@{ shape: hex, label: 'say \"hi\"' }"],
    ["a lone double quote inside single quotes", "A@{ shape: hex, label: 'a \" b' }"],
    ["an escaped quote", 'A@{ shape: cyl, label: "say \\"hi\\"" }'],
    ["a Markdown string label", 'A@{ shape: cyl, label: "`**bold**`" }'],
    ["an unquoted label with a bracket", "A@{ shape: cyl, label: a[0] }"],
    ["an unquoted label with a colon", "A@{ shape: cyl, label: a: b }"],
    ["an unquoted label with an apostrophe", "A@{ shape: cyl, label: Bob's }"],
    ["text after the object", "A@{ shape: cyl } & B"],
    ["a second object", "A@{ shape: cyl } B@{ shape: hex }"],
    ["a bracket label after the object", "A@{ shape: cyl }[x]"],
    ["a quoted key", 'A@{ "shape": cyl }'],
    ["an id that is not an id", "a b@{ shape: cyl }"],
    ["an id run into a bracket shape", "A[x]@{ shape: cyl }"],
  ])("refuses %s rather than draw it wrong", (_name, expression) => {
    expect(parseNodeExpression(expression)).toBeNull();
  });

  it("leaves a quoted bracket label that happens to mention @{ alone", () => {
    expect(parseNodeExpression('A["use @{ shape: x } here"]')).toMatchObject({
      id: "A",
      label: "use @{ shape: x } here",
      shape: "rect",
    });
  });
});

describe("splitChain", () => {
  it("reads a chain of three nodes as two edges", () => {
    const chain = splitChain("A --> B --> C");
    expect(chain?.parts).toHaveLength(3);
    expect(chain?.operators).toHaveLength(2);
  });

  it("picks the longer operator when two start at the same place", () => {
    // "-.->" must not be read as "-.-" followed by a stray ">".
    expect(splitChain("A -.-> B")?.operators[0]).toMatchObject({ style: "dotted", arrow: true });
  });

  it("reads the pipe label form", () => {
    expect(splitChain("A -->|yes| B")?.operators[0].label).toBe("yes");
  });

  it("distinguishes a line from an arrow", () => {
    expect(splitChain("A --- B")?.operators[0].arrow).toBe(false);
    expect(splitChain("A --> B")?.operators[0].arrow).toBe(true);
  });

  it("returns null when there is no edge at all", () => {
    expect(splitChain("A[Just a node]")).toBeNull();
  });

  it("keeps a shape object whole, whatever it holds", () => {
    const chain = splitChain('A@{ shape: db, label: "a --> b, c ==> d" } --> B@{ shape: hex } -.-> C');
    expect(chain?.parts.map((part) => part.trim())).toEqual([
      'A@{ shape: db, label: "a --> b, c ==> d" }',
      "B@{ shape: hex }",
      "C",
    ]);
    expect(chain?.operators).toHaveLength(2);
  });

  it("finds no edge inside a lone shape object", () => {
    expect(splitChain('A@{ shape: db, label: "a --> b" }')).toBeNull();
  });
});

describe("normalizeEdgeLabels", () => {
  it("rewrites the inline label form into the pipe form", () => {
    expect(normalizeEdgeLabels("A -- yes --> B")).toBe("A -->|yes| B");
    expect(normalizeEdgeLabels("A == thick ==> B")).toBe("A ==>|thick| B");
  });

  it("leaves a plain arrow alone", () => {
    expect(normalizeEdgeLabels("A --> B")).toBe("A --> B");
  });

  it("leaves the inside of a shape object alone", () => {
    expect(normalizeEdgeLabels('A@{ shape: db, label: "x -- y --> z" } -- yes --> B')).toBe(
      'A@{ shape: db, label: "x -- y --> z" } -->|yes| B',
    );
  });
});

describe("parseFlowchart", () => {
  /** The diagram in this repo's own README, subgraphs and all. */
  const README = `flowchart LR
  subgraph client["Paseo app"]
    S["status · cleanup · processes"]
  end
  subgraph server["Daemon subprocess"]
    M["metrics"]
  end
  OS["vm_stat · df · ps"]

  S -- "useRpc(contract, input)" --> M
  M --> OS`;

  it("reads direction from the header", () => {
    expect(parseFlowchart("flowchart LR\n A --> B")?.direction).toBe("LR");
    expect(parseFlowchart("graph TD\n A --> B")?.direction).toBe("TD");
  });

  it("defaults to top-down when the header omits a direction", () => {
    expect(parseFlowchart("flowchart\n A --> B")?.direction).toBe("TD");
  });

  it("returns null for something that is not a flowchart", () => {
    expect(parseFlowchart("sequenceDiagram\n A->>B: hi")).toBeNull();
  });

  it("parses the README diagram's nodes and edges", () => {
    const chart = parseFlowchart(README);
    expect(chart?.nodes.map((node) => node.id).sort()).toEqual(["M", "OS", "S"]);
    expect(chart?.edges).toHaveLength(2);
    expect(chart?.edges[0].label).toBe("useRpc(contract, input)");
  });

  it("reports subgraph lines as skipped instead of dropping them silently", () => {
    const chart = parseFlowchart(README);
    expect(chart?.skipped.some((line) => line.startsWith("subgraph"))).toBe(true);
  });

  it("keeps the labelled definition when a node is also mentioned bare", () => {
    const chart = parseFlowchart("flowchart TD\n A --> B\n A[Real label] --> C");
    expect(chart?.nodes.find((node) => node.id === "A")?.label).toBe("Real label");
  });

  it("ignores comments", () => {
    const chart = parseFlowchart("flowchart TD\n %% a note\n A --> B");
    expect(chart?.edges).toHaveLength(1);
    expect(chart?.skipped).toHaveLength(0);
  });

  it("skips styling directives rather than treating them as nodes", () => {
    const chart = parseFlowchart("flowchart TD\n A --> B\n style A fill:#f9f");
    expect(chart?.nodes).toHaveLength(2);
    expect(chart?.skipped).toEqual(["style A fill:#f9f"]);
  });

  it("reads a shape object inside an edge chain", () => {
    const chart = parseFlowchart('flowchart LR\n  A@{ shape: hex, label: "x, y: z" } --> B');
    expect(chart?.nodes).toEqual([
      { id: "A", label: "x, y: z", shape: "hexagon" },
      { id: "B", label: "B", shape: "rect" },
    ]);
    expect(chart?.edges).toEqual([{ from: "A", to: "B", label: null, style: "solid", arrow: true }]);
    expect(chart?.skipped).toEqual([]);
  });

  it("reads shape objects at both ends of a labelled edge", () => {
    const chart = parseFlowchart(
      'flowchart LR\n  A@{ shape: db, label: "a, b" } -- "uses {it}" --> B@{ shape: trap-t };',
    );
    expect(chart?.nodes.map((node) => [node.id, node.shape])).toEqual([
      ["A", "cylinder"],
      ["B", "trapezoid-top"],
    ]);
    expect(chart?.edges).toHaveLength(1);
    expect(chart?.edges[0].label).toBe("uses {it}");
    expect(chart?.skipped).toEqual([]);
  });

  it("reads a shape object on its own line, and later edges reuse its id", () => {
    const chart = parseFlowchart(
      'flowchart TD\n  A@{ shape: cyl, label: "Orders --> DB" }\n  B@{ shape: dbl-circ }\n  A --> B\n  B --> C',
    );
    expect(chart?.nodes.map((node) => [node.id, node.label, node.shape])).toEqual([
      ["A", "Orders --> DB", "cylinder"],
      ["B", "B", "double-circle"],
      ["C", "C", "rect"],
    ]);
    expect(chart?.edges.map((edge) => [edge.from, edge.to])).toEqual([
      ["A", "B"],
      ["B", "C"],
    ]);
    expect(chart?.skipped).toEqual([]);
  });

  it("lets a labelled shape object replace an earlier bare mention", () => {
    const chart = parseFlowchart('flowchart TD\n  A --> B\n  A@{ shape: cyl, label: "Orders" }');
    expect(chart?.nodes.find((node) => node.id === "A")).toEqual({ id: "A", label: "Orders", shape: "cylinder" });
  });

  it.each([
    ["img", 'A@{ shape: cyl, img: "https://x.test/a.png", label: "x" } --> B'],
    ["icon", 'A@{ icon: "fa:user", form: "square", label: "x" } --> B'],
    ["pos", "A@{ shape: cyl, pos: b } --> B"],
    ["constraint", "A@{ shape: cyl, constraint: on } --> B"],
    ["w", "A@{ shape: cyl, w: 100 } --> B"],
    ["h", "A@{ shape: cyl, h: 100 } --> B"],
    ["form", "A@{ shape: cyl, form: square } --> B"],
    ["an unknown shape", "A@{ shape: cloud } --> B"],
    ["an unclosed object", "A@{ shape: cyl"],
    ["an unclosed object in a chain", "A@{ shape: cyl --> B"],
    ["a bare object with another key", "A@{ shape: cyl, img: x }"],
    ["an edge property object", "e1@{ animate: true }"],
    ["a node run in with &", "A@{ shape: cyl } & B --> C"],
  ])("skips a shape object with %s", (_name, line) => {
    const chart = parseFlowchart(`flowchart LR\n  ${line}`);
    expect(chart?.skipped).toEqual([line]);
    expect(chart?.nodes).toEqual([]);
    expect(chart?.edges).toEqual([]);
  });

  it("reads a shape object followed by a %% comment, which is cut like any other", () => {
    const chart = parseFlowchart("flowchart LR\n  A@{ shape: cyl } --> B %% the database");
    expect(chart?.nodes.map((node) => [node.id, node.shape])).toEqual([
      ["A", "cylinder"],
      ["B", "rect"],
    ]);
    expect(chart?.skipped).toEqual([]);
  });

  it("skips a shape object whose quoted label holds %%, which the comment cut leaves unclosed", () => {
    const line = 'A@{ shape: cyl, label: "50%% off" } --> B';
    const chart = parseFlowchart(`flowchart LR\n  ${line}`);
    expect(chart?.skipped).toEqual([line]);
    expect(chart?.nodes).toEqual([]);
  });

  it("skips a shape object followed by a :::class shorthand, which the plugin does not apply", () => {
    for (const line of ["A@{ shape: cyl }:::hot", "A@{ shape: cyl }:::hot --> B", "A --> B@{ shape: hex }:::hot"]) {
      const chart = parseFlowchart(`flowchart LR\n  ${line}`);
      expect(chart?.skipped, line).toEqual([line]);
      expect(chart?.nodes, line).toEqual([]);
    }
  });

  it("skips a multi-line shape object line by line, never half-reading it", () => {
    const chart = parseFlowchart('flowchart LR\n  A@{\n    shape: cyl\n    label: "x"\n  }\n  A --> B');
    expect(chart?.skipped).toEqual(["A@{", "shape: cyl", 'label: "x"', "}"]);
    expect(chart?.nodes.map((node) => node.id)).toEqual(["A", "B"]);
  });
});

describe("parseFlowchart redefining a node", () => {
  /** Mermaid keeps the last shape and the last label a node was given; a bare mention gives neither. */
  const node = (lines: string[], id = "A") =>
    parseFlowchart(`flowchart TD\n  ${lines.join("\n  ")}`)?.nodes.find((candidate) => candidate.id === id);

  it("takes a later shape and label over an earlier bracket definition", () => {
    expect(node(["A[Orders] --> B", 'A@{ shape: db, label: "Orders DB" }'])).toEqual({
      id: "A",
      label: "Orders DB",
      shape: "cylinder",
    });
  });

  it("takes a later shape over an earlier one, including the default rect", () => {
    expect(node(["A@{ shape: db }", "A@{ shape: rect }"])).toEqual({ id: "A", label: "A", shape: "rect" });
  });

  it("takes a later bracket shape whose label is the id", () => {
    expect(node(["A[x]", "A{A}"])).toEqual({ id: "A", label: "A", shape: "diamond" });
    expect(node(["A --> B", "A((A))"])).toEqual({ id: "A", label: "A", shape: "circle" });
  });

  it("still lists a shape that a later mention replaced among the shapes the source gave", () => {
    const chart = parseFlowchart("flowchart TD\n  A[/in/] --> B\n  A[in]");
    expect(chart?.nodes.find((candidate) => candidate.id === "A")?.shape).toBe("rect");
    expect(chart?.shapes).toEqual(["lean-right", "rect"]);
  });

  it("takes the later of two labels", () => {
    expect(node(["A[x]", "A[y]"])).toEqual({ id: "A", label: "y", shape: "rect" });
    expect(node(["A{x}", "A[y]"])).toEqual({ id: "A", label: "y", shape: "rect" });
  });

  it("keeps the label when a later shape object gives only a shape, and the shape when it gives only a label", () => {
    expect(node(["A[Orders] --> B", "A@{ shape: db }"])).toEqual({ id: "A", label: "Orders", shape: "cylinder" });
    expect(node(['A@{ shape: db, label: "Orders" }', "A@{ shape: hex }"])).toEqual({
      id: "A",
      label: "Orders",
      shape: "hexagon",
    });
    expect(node(["A --> B", "A@{ shape: db }"])).toEqual({ id: "A", label: "A", shape: "cylinder" });
  });

  it("changes neither label nor shape on a bare later mention", () => {
    expect(node(['A@{ shape: db, label: "Orders" }', "B --> A", "A --> C", "A"])).toEqual({
      id: "A",
      label: "Orders",
      shape: "cylinder",
    });
    expect(node(["A{Pick}", "B --> A"])).toEqual({ id: "A", label: "Pick", shape: "diamond" });
  });

  it("applies mentions in the order they are written, inside one chain too", () => {
    expect(node(["A[first] --> B --> A[second]"])).toEqual({ id: "A", label: "second", shape: "rect" });
  });

  it("keeps a node where it first appeared", () => {
    const chart = parseFlowchart("flowchart TD\n  A --> B\n  B --> C\n  A@{ shape: db }");
    expect(chart?.nodes.map((candidate) => candidate.id)).toEqual(["A", "B", "C"]);
  });
});
