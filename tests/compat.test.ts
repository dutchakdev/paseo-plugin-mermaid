import { describe, expect, it } from "vitest";
import type { PluginClientContext } from "@getpaseo/plugin/client";
import { addFilePanel, hostMarkdown } from "../client/compat";

// Stand-ins for the app: what differs between app versions is which members exist.
const contribution = { id: "mermaid-file", title: "Mermaid", icon: "Workflow", files: { extensions: ["mmd"] }, Component: () => null };

describe("hostMarkdown", () => {
  it("uses Paseo's Markdown where the app has it (0.13 and later)", () => {
    const Markdown = () => null;
    expect(hostMarkdown({ Markdown })).toBe(Markdown);
  });

  it("finds none in apps before 0.13, so the plugin keeps its own renderer", () => {
    expect(hostMarkdown({})).toBeNull();
  });
});

describe("addFilePanel", () => {
  it("registers the panel where the app has file panels (0.13 and later)", () => {
    const registered: unknown[] = [];
    const cleanup = () => {};
    const client = { addFilePanel: (value: unknown) => (registered.push(value), cleanup) } as unknown as PluginClientContext;
    expect(addFilePanel(client, contribution)).toBe(cleanup);
    expect(registered).toEqual([contribution]);
  });

  it("skips it on apps before 0.13 instead of failing the whole client entry", () => {
    expect(addFilePanel({} as PluginClientContext, contribution)).toBeNull();
  });
});
