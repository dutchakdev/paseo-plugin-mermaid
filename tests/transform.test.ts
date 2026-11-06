import { describe, expect, it } from "vitest";
import { mermaidFence } from "../shared/fence";
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

describe("split with Paseo's Markdown", () => {
  const host = { hostMarkdown: true };
  const SUBGRAPH = "flowchart TD\n  subgraph S\n    A --> B\n  end";

  it("draws a pie chart through Mermaid instead of leaving the message", () => {
    const result = split('Intro\n\n```mermaid\npie title Pets\n  "Dogs" : 3\n```', "complete", host);
    expect(result?.items.map((item) => item.kind)).toEqual([TEXT_KIND, TEXT_KIND]);
    expect(result?.items[1].data).toEqual({ text: mermaidFence('pie title Pets\n  "Dogs" : 3') });
  });

  it("keeps an inline diagram and a Mermaid one in message order", () => {
    const result = split(`Before\n\n${DIAGRAM}\n\nBetween\n\n${mermaidFence(SUBGRAPH)}`, "complete", host);
    expect(result?.items.map((item) => item.kind)).toEqual([TEXT_KIND, DIAGRAM_KIND, TEXT_KIND, TEXT_KIND]);
    expect(result?.items[3].data).toEqual({ text: mermaidFence(SUBGRAPH) });
  });

  it("keeps a message with a link definition whole", () => {
    // Each prose item is a Markdown document of its own, so Paseo's Markdown gets the message in one piece.
    const text = `See [docs][d].\n\n${DIAGRAM}\n\n[d]: https://example.com`;
    const result = split(text, "complete", host);
    expect(result?.items.map((item) => item.kind)).toEqual([TEXT_KIND]);
    expect(result?.items[0].data).toEqual({ text });
  });

  it("still leaves a message without a diagram alone", () => {
    expect(split("plain", "complete", host)).toBeUndefined();
  });

  it("uses a fence longer than any backtick run", () => {
    const source = 'flowchart TD\n  A["a ``` b"] --> B\n  subgraph S\n    C\n  end';
    const result = split(`\`\`\`\`mermaid\n${source}\n\`\`\`\``, "complete", host);
    const { text } = result?.items[0].data as { text: string };
    expect(text.startsWith("````mermaid\n")).toBe(true);
    expect(text.endsWith("\n````")).toBe(true);
  });

  it("behaves as before without Paseo's Markdown", () => {
    const pie = 'Intro\n\n```mermaid\npie title Pets\n  "Dogs" : 3\n```';
    expect(split(pie, "complete", { hostMarkdown: false })).toBeUndefined();
    expect(split(pie, "complete")).toBeUndefined();
  });
});

describe("split where the app cannot skew a View", () => {
  const LEAN = "flowchart LR\n  A[/in/] --> B";
  const CYLINDER = "flowchart LR\n  A[(db)] --> B{{prep}}";

  it("hands a diagram with a slanted node to Paseo's Markdown as a mermaid fence", () => {
    const result = split(`Intro\n\n${mermaidFence(LEAN)}`, "complete", { hostMarkdown: true, skew: false });
    expect(result?.items.map((item) => item.kind)).toEqual([TEXT_KIND, TEXT_KIND]);
    expect(result?.items[1].data).toEqual({ text: mermaidFence(LEAN) });
  });

  it("leaves the message to Paseo on apps without Paseo's Markdown", () => {
    expect(split(`Intro\n\n${mermaidFence(LEAN)}`, "complete", { hostMarkdown: false, skew: false })).toBeUndefined();
  });

  it("still draws shapes that need no skew", () => {
    const result = split(mermaidFence(CYLINDER), "complete", { hostMarkdown: true, skew: false });
    expect(result?.items.map((item) => item.kind)).toEqual([DIAGRAM_KIND]);
  });

  it("draws the slanted diagram where the app can skew, as by default", () => {
    expect(split(mermaidFence(LEAN), "complete", { hostMarkdown: true, skew: true })?.items[0].kind).toBe(DIAGRAM_KIND);
    expect(split(mermaidFence(LEAN), "complete")?.items[0].kind).toBe(DIAGRAM_KIND);
  });
});

describe("split handing Paseo a diagram with shape objects", () => {
  const host = { hostMarkdown: true };
  // The subgraph is why the plugin does not draw it; Paseo's Mermaid refuses any source with `@{`.
  const OBJECTS = 'flowchart LR\n  A@{ shape: db, label: "Orders DB" } --> B\n  subgraph S\n    B --> C@{ shape: hex }\n  end';

  it("writes the objects as bracket syntax in the fence", () => {
    const result = split(`Intro\n\n${mermaidFence(OBJECTS)}`, "complete", host);
    expect(result?.items.map((item) => item.kind)).toEqual([TEXT_KIND, TEXT_KIND]);
    const { text } = result?.items[1].data as { text: string };
    expect(text).toContain('A[("Orders DB")]');
    expect(text).toContain('C{{"C"}}');
    expect(text).not.toContain("@{");
    expect(text).toBe(
      mermaidFence('flowchart LR\n  A[("Orders DB")] --> B\n  subgraph S\n    B --> C{{"C"}}\n  end'),
    );
  });

  it("leaves an object it cannot write as brackets in the fence", () => {
    const source = 'flowchart LR\n  A@{ shape: cloud } --> B\n  subgraph S\n    B\n  end';
    expect(split(mermaidFence(source), "complete", host)?.items[0].data).toEqual({ text: mermaidFence(source) });
  });

  it("still draws a diagram of shape objects inline from its own source", () => {
    const source = 'flowchart LR\n  A@{ shape: db, label: "Orders DB" } --> B';
    expect(split(mermaidFence(source), "complete", host)?.items).toEqual([
      { type: "plugin", kind: DIAGRAM_KIND, version: 1, data: { source } },
    ]);
  });

  it("rewrites the one that goes to Paseo and not the one drawn here", () => {
    const drawn = "flowchart LR\n  A@{ shape: db } --> B";
    const result = split(`${mermaidFence(drawn)}\n\n${mermaidFence(OBJECTS)}`, "complete", host);
    expect(result?.items.map((item) => item.kind)).toEqual([DIAGRAM_KIND, TEXT_KIND]);
    expect(result?.items[0].data).toEqual({ source: drawn });
    expect((result?.items[1].data as { text: string }).text).not.toContain("@{");
  });

  it("hands a diagram Paseo cannot skew for this app over without objects too", () => {
    const source = 'flowchart LR\n  A@{ shape: lean-r, label: "in" } --> B';
    const result = split(mermaidFence(source), "complete", { hostMarkdown: true, skew: false });
    expect(result?.items[0].kind).toBe(TEXT_KIND);
    expect(result?.items[0].data).toEqual({ text: mermaidFence('flowchart LR\n  A[/"in"/] --> B') });
  });
});

describe("split keeping a message whole for Paseo's Markdown, with shape objects", () => {
  const host = { hostMarkdown: true };
  const LINK = "[d]: https://example.com";
  const message = (diagram: string) => `See [the docs][d] first.\n\n  ${"```"}mermaid \n${diagram}\n  ${"```"}  \n\nAfter *it*.\n\n${LINK}\n`;
  const DRAWN = 'flowchart LR\n  A@{ shape: db, label: "Orders" } --> B';
  const NOT_DRAWN = 'flowchart LR\n  A@{ shape: db, label: "Orders" } --> B\n  subgraph S\n    B --> C\n  end';

  it.each([
    ["a diagram the plugin draws", DRAWN],
    ["a diagram the plugin does not draw", NOT_DRAWN],
  ])("writes the objects in %s as brackets and changes nothing else", (_name, diagram) => {
    const text = message(diagram);
    const result = split(text, "complete", host);
    expect(result?.items.map((item) => item.kind)).toEqual([TEXT_KIND]);
    expect(result?.items[0].data).toEqual({ text: text.replace('A@{ shape: db, label: "Orders" }', 'A[("Orders")]') });
    expect((result?.items[0].data as { text: string }).text).not.toContain("@{");
  });

  it("returns a whole message without shape objects byte for byte", () => {
    const text = message("flowchart LR\n  A[(Orders)] --> B\n  subgraph S\n    B --> C\n  end");
    expect(split(text, "complete", host)?.items[0].data).toEqual({ text });
  });

  it("rewrites every mermaid fence in the message and no other fence", () => {
    const text = `${message(DRAWN)}\n${"```"}ts\nconst a = {};\nA@{ shape: db }\n${"```"}\n\n${"```"}mermaid\nflowchart TD\n  B@{ shape: hex }\n${"```"}`;
    const { text: out } = split(text, "complete", host)?.items[0].data as { text: string };
    expect(out).toBe(text.replace('A@{ shape: db, label: "Orders" }', 'A[("Orders")]').replace("B@{ shape: hex }", 'B{{"B"}}'));
    expect(out).toContain("A@{ shape: db }");
  });

  it("leaves an object it cannot write as brackets where it is", () => {
    const text = message("flowchart LR\n  A@{ shape: cloud } --> B");
    expect(split(text, "complete", host)?.items[0].data).toEqual({ text });
  });

  it("rewrites a fence that is still arriving, up to the line being typed", () => {
    const head = `See [the docs][d].\n\n${LINK}\n\n${"```"}mermaid\nflowchart LR\n`;
    const streamed = (typed: string) => split(head + typed, "streaming", host)?.items;
    expect(streamed('A@{ shape: db } --> B\n  C@{ shape: hex')).toEqual([
      { type: "plugin", kind: TEXT_KIND, version: 1, data: { text: `${head}A[("A")] --> B\n  C@{ shape: hex` } },
    ]);
    expect(streamed('A@{ shape: db, label: "Or')?.[0].data).toEqual({ text: `${head}A@{ shape: db, label: "Or` });
    expect(streamed("")?.[0].data).toEqual({ text: head });
  });

  it("does not write brackets for Paseo when the message is left to it, on apps without its Markdown", () => {
    expect(split(message(DRAWN), "complete")).toBeUndefined();
  });
});
