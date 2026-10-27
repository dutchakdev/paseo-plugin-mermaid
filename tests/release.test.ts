import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error The release helper is plain ESM without declarations.
import { checkChangelog, distTag, nextVersion, parseChangelog, planRelease, releaseChangelog, releaseNotes } from "../scripts/release.mjs";

const read = (name: string) => readFileSync(fileURLToPath(new URL(`../${name}`, import.meta.url)), "utf8");
const changelog = read("CHANGELOG.md");
const packageVersion: string = JSON.parse(read("package.json")).version;
// Fixtures start from the released history, whatever the working copy has under Unreleased.
const base = changelog.replace(/## Unreleased\n[\s\S]*?(?=\n## )/, "").replace(/\n{3,}/g, "\n\n");
const unreleased = (entries: string) => base.replace("# Changelog\n", `# Changelog\n\n## Unreleased\n\n${entries}\n`);

describe("the repository changelog", () => {
  it("parses with newest versions first and covers package.json", () => {
    const versions = parseChangelog(changelog).filter((section: { version: string | null }) => section.version);
    expect(versions.map((section: { version: string }) => section.version)).toContain("0.2.0");
    expect(() => checkChangelog(changelog, packageVersion)).not.toThrow();
  });

  it("gives a released version its own notes only", () => {
    const notes = releaseNotes(changelog, "0.2.0");
    expect(notes).toContain("A toolbar above every diagram");
    expect(notes).not.toMatch(/^## /m);
  });
});

describe("cutting a release", () => {
  it("dates the Unreleased section and leaves earlier ones alone", () => {
    const next = releaseChangelog(unreleased("### Fixed\n\n- A fix."), "9.0.0", "2026-12-01");
    expect(next).toContain("## 9.0.0 - 2026-12-01\n\n### Fixed\n\n- A fix.");
    expect(next).not.toContain("## Unreleased");
    expect(next.slice(next.indexOf("## 0.2.0"))).toBe(base.slice(base.indexOf("## 0.2.0")));
    expect(releaseNotes(next, "9.0.0")).toBe("### Fixed\n\n- A fix.\n");
  });

  it("refuses a missing or empty Unreleased section and a repeated version", () => {
    expect(() => releaseChangelog(base, "9.0.0", "2026-12-01")).toThrow("no `## Unreleased`");
    expect(() => releaseChangelog(unreleased("### Fixed"), "9.0.0", "2026-12-01")).toThrow("lists no changes");
    expect(() => releaseChangelog(unreleased("- A fix."), "0.2.0", "2026-12-01")).toThrow("already has a section for 0.2.0");
  });

  it("rejects a changelog out of version order or without the package version", () => {
    const swapped = base.replace("## 0.2.0", "## 0.0.1");
    expect(() => checkChangelog(swapped, "0.0.1")).toThrow("above");
    expect(() => checkChangelog(base, "5.0.0")).toThrow("no section for package version 5.0.0");
    expect(() => checkChangelog(base.replace("## 0.1.0", "## Notes"), packageVersion)).toThrow("neither Unreleased nor a version");
    expect(() => checkChangelog(base.replace("## 0.1.0", "## v0.1.0"), packageVersion)).toThrow("neither Unreleased nor a version");
  });
});

describe("semantic versions", () => {
  it("bumps from keywords and accepts only newer explicit versions", () => {
    expect(nextVersion("0.3.0", "patch")).toBe("0.3.1");
    expect(nextVersion("0.3.0", "minor")).toBe("0.4.0");
    expect(nextVersion("0.3.0", "major")).toBe("1.0.0");
    expect(nextVersion("0.3.0", "preminor")).toBe("0.4.0-beta.0");
    expect(nextVersion("0.4.0-beta.0", "prerelease")).toBe("0.4.0-beta.1");
    expect(nextVersion("0.4.0-beta.1", "0.4.0")).toBe("0.4.0");
    expect(() => nextVersion("0.3.0", "0.3.0")).toThrow("not newer");
    expect(() => nextVersion("0.3.0", "0.2.9")).toThrow("not newer");
    expect(() => nextVersion("0.3.0", "next")).toThrow("explicit version");
  });

  it("publishes prereleases under next", () => {
    expect(distTag("0.4.0-beta.1")).toBe("next");
    expect(distTag("0.4.0")).toBe("latest");
  });
});

describe("planning a tagged release", () => {
  // Far past the real history, so releasing a version never collides with this fixture.
  const released = releaseChangelog(unreleased("### Added\n\n- A feature."), "9.0.0", "2026-12-01");
  const plan = (overrides: Record<string, unknown>) => planRelease({ tag: "v9.0.0", packageVersion: "9.0.0", changelog: released, published: ["0.1.0", "0.2.0"], ...overrides });

  it("publishes a new version under the matching dist-tag", () => {
    expect(plan({})).toEqual({ version: "9.0.0", distTag: "latest", publish: true });
    expect(plan({ published: [] })).toMatchObject({ publish: true });
  });

  it("finishes a re-run without publishing the same version again", () => {
    expect(plan({ published: ["0.2.0", "9.0.0"] })).toEqual({ version: "9.0.0", distTag: "latest", publish: false });
  });

  it("refuses a mismatched tag, an undated section, and a version older than npm's newest", () => {
    expect(() => plan({ tag: "v9.0.1" })).toThrow("does not match package.json version 9.0.0");
    expect(() => plan({ changelog: unreleased("- A feature.").replace("## Unreleased", "## 9.0.0") })).toThrow("dated");
    expect(() => plan({ published: ["9.1.0-beta.1"] })).toThrow("not newer than 9.1.0-beta.1");
  });
});
