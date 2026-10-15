import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error The packaging helper is plain ESM without declarations.
import { inspectPackage } from "../scripts/check-package.mjs";

const read = (name: string) => readFileSync(fileURLToPath(new URL(`../${name}`, import.meta.url)), "utf8");
const sourceManifest = JSON.parse(read("paseo-plugin.json"));
const files = [
  "package.json", "paseo-plugin.json", "OVERVIEW.md", "README.md", "LICENSE",
  "index.client.tsx", "client/diagram.tsx", "shared/flowchart.ts",
];
const inspect = (overrides: Record<string, unknown>) => inspectPackage({ files, manifest: sourceManifest, overview: read("OVERVIEW.md"), sourceManifest, ...overrides });

describe("packed tarball", () => {
  it("accepts the repository's own manifest and overview", () => {
    expect(inspect({})).toEqual([]);
  });

  it("names missing files and development files that leaked in", () => {
    expect(inspect({ files: [...files.filter((file) => file !== "OVERVIEW.md"), "tests/zoom.test.ts", "docs/preview.svg"] }))
      .toEqual(["missing OVERVIEW.md", "unexpected tests/zoom.test.ts", "unexpected docs/preview.svg"]);
  });

  it("rejects a manifest that differs from the source", () => {
    expect(inspect({ manifest: { ...sourceManifest, requirements: { paseo: ">=0.11.0" } } })).toEqual(["paseo-plugin.json differs from the source manifest"]);
  });

  it("rejects an overview with an install command, which the plugin directory refuses", () => {
    expect(inspect({ overview: "Run `paseo plugin add dutchakdev/mermaid`." })).toEqual(["OVERVIEW.md contains an install command"]);
    expect(inspect({ overview: "Then npm i the CLI." })).toEqual(["OVERVIEW.md contains an install command"]);
  });

  it("keeps the repository's own overview free of install commands", () => {
    expect(read("OVERVIEW.md")).not.toMatch(/paseo plugin add|npm install|\bnpm i\b/);
  });
});
