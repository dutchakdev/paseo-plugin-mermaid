import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import semver from "semver";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const HEADING = /^## (.+?)\s*$/gm;
const VERSION_HEADING = /^(\S+?)(?: - (\d{4}-\d{2}-\d{2}))?$/;
const BUMPS = ["major", "minor", "patch", "premajor", "preminor", "prepatch", "prerelease"];

/** The `## ` sections of a changelog, in file order. */
export function parseChangelog(text) {
  const headings = [...text.matchAll(HEADING)];
  return headings.map((match, index) => {
    const title = match[1];
    const start = match.index;
    const end = index + 1 < headings.length ? headings[index + 1].index : text.length;
    const body = text.slice(start + match[0].length, end).trim();
    if (title === "Unreleased") return { title, version: null, date: null, body, start, end };
    const [, version, date = null] = title.match(VERSION_HEADING) ?? [];
    // Strict: semver.valid would also accept "v1.2.3" and return "1.2.3".
    if (!version || semver.valid(version) !== version) throw new Error(`CHANGELOG.md heading "## ${title}" is neither Unreleased nor a version.`);
    return { title, version, date, body, start, end };
  });
}

/** Rejects a changelog a release could not be cut from. */
export function checkChangelog(text, packageVersion) {
  const sections = parseChangelog(text);
  const versions = sections.filter((section) => section.version);
  if (sections.some((section, index) => section.version === null && index > 0)) throw new Error("`## Unreleased` must be the first section of CHANGELOG.md.");
  versions.forEach((section, index) => {
    const older = versions[index + 1];
    if (older && !semver.gt(section.version, older.version)) throw new Error(`CHANGELOG.md lists ${section.version} above ${older.version}.`);
  });
  if (!versions.some((section) => section.version === packageVersion)) throw new Error(`CHANGELOG.md has no section for package version ${packageVersion}.`);
  return sections;
}

/** Turns `## Unreleased` into the dated section for `version`. */
export function releaseChangelog(text, version, date) {
  const sections = parseChangelog(text);
  const unreleased = sections.find((section) => section.version === null);
  if (!unreleased) throw new Error("CHANGELOG.md has no `## Unreleased` section to release.");
  if (!/^\s*- /m.test(unreleased.body)) throw new Error("`## Unreleased` lists no changes.");
  if (sections.some((section) => section.version === version)) throw new Error(`CHANGELOG.md already has a section for ${version}.`);
  return `${text.slice(0, unreleased.start)}## ${version} - ${date}${text.slice(unreleased.start + "## Unreleased".length)}`;
}

/** The body of a released version's section, for the GitHub release. */
export function releaseNotes(text, version) {
  const section = parseChangelog(text).find((item) => item.version === version);
  if (!section?.body) throw new Error(`CHANGELOG.md has no notes for ${version}.`);
  return `${section.body}\n`;
}

/** The next version from a bump keyword or an explicit version. */
export function nextVersion(current, spec) {
  const next = BUMPS.includes(spec) ? semver.inc(current, spec, "beta") : semver.valid(spec);
  if (!next) throw new Error(`Use one of ${BUMPS.join(", ")} or an explicit version, not "${spec}".`);
  if (!semver.gt(next, current)) throw new Error(`${next} is not newer than ${current}.`);
  return next;
}

export const distTag = (version) => (semver.prerelease(version) ? "next" : "latest");

/** What the Release workflow may do with `tag`, given what npm already has. */
export function planRelease({ tag, packageVersion, changelog, published }) {
  if (tag !== `v${packageVersion}`) throw new Error(`Tag ${tag} does not match package.json version ${packageVersion}.`);
  if (!semver.valid(packageVersion)) throw new Error(`${packageVersion} is not a semantic version.`);
  const section = parseChangelog(changelog).find((item) => item.version === packageVersion);
  if (!section?.date) throw new Error(`CHANGELOG.md needs a dated "## ${packageVersion} - YYYY-MM-DD" section.`);
  if (!section.body) throw new Error(`CHANGELOG.md section ${packageVersion} is empty.`);
  // A re-run after a successful publish only finishes the GitHub release.
  if (published.includes(packageVersion)) return { version: packageVersion, distTag: distTag(packageVersion), publish: false };
  const newest = semver.maxSatisfying(published, "*", { includePrerelease: true });
  if (newest && !semver.gt(packageVersion, newest)) throw new Error(`${packageVersion} is not newer than ${newest}, the newest version on npm.`);
  return { version: packageVersion, distTag: distTag(packageVersion), publish: true };
}

const read = (name) => readFileSync(join(root, name), "utf8");
const packageJson = () => JSON.parse(read("package.json"));
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();

/** Today in the maintainer's time zone, as the changelog writes dates. */
function localDate(now = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function publishedVersions(name) {
  try {
    const output = execFileSync("npm", ["view", name, "versions", "--json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    const versions = JSON.parse(output);
    return Array.isArray(versions) ? versions : [versions];
  } catch (error) {
    if (String(error.stderr).includes("E404")) return [];
    throw error;
  }
}

function setOutputs(values) {
  const lines = Object.entries(values).map(([key, value]) => `${key}=${value}`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${lines.join("\n")}\n`);
  console.log(lines.join("\n"));
}

const commands = {
  check() {
    checkChangelog(read("CHANGELOG.md"), packageJson().version);
  },
  prepare(spec) {
    // The printed `git commit -am` would also take unrelated edits to tracked files.
    if (git("status", "--porcelain", "--untracked-files=no")) throw new Error("Commit or stash local changes before preparing a release.");
    if (git("rev-parse", "--abbrev-ref", "HEAD") !== "main") throw new Error("Prepare releases on main.");
    const version = nextVersion(packageJson().version, spec);
    // Validate the changelog before touching any file, so a failure leaves nothing half-done.
    const changelog = releaseChangelog(read("CHANGELOG.md"), version, localDate());
    execFileSync("npm", ["version", version, "--no-git-tag-version"], { cwd: root, stdio: "inherit" });
    writeFileSync(join(root, "CHANGELOG.md"), changelog);
    console.log(`Prepared ${version}. Review the diff, run npm run check, then:\n`);
    console.log(`  git commit -am "Release ${version}"\n  git push origin main\n  git tag v${version}\n  git push origin v${version}`);
  },
  notes(version) {
    process.stdout.write(releaseNotes(read("CHANGELOG.md"), version));
  },
  verify(tag) {
    const { name, version } = packageJson();
    // Only commits that reached main are released, so a tag on a stray branch fails here.
    try { execFileSync("git", ["merge-base", "--is-ancestor", `refs/tags/${tag}^{commit}`, "origin/main"], { cwd: root, stdio: "ignore" }); }
    catch { throw new Error(`${tag} is not on origin/main.`); }
    const plan = planRelease({ tag, packageVersion: version, changelog: read("CHANGELOG.md"), published: publishedVersions(name) });
    setOutputs({ name, version: plan.version, "dist-tag": plan.distTag, publish: plan.publish });
  },
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [command, argument] = process.argv.slice(2);
  const run = commands[command];
  if (!run || (command !== "check" && !argument)) {
    console.error("Usage: node scripts/release.mjs <check | prepare <bump|version> | notes <version> | verify <tag>>");
    process.exit(2);
  }
  try { run(argument); }
  catch (error) { console.error(error.message); process.exit(1); }
}
