import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

// The tarball is what npm, Paseo Cafe and the Paseo plugin directory install.
const REQUIRED = [
  "package.json", "paseo-plugin.json", "OVERVIEW.md", "README.md", "LICENSE",
  "index.client.tsx", "client/diagram.tsx", "shared/flowchart.ts",
];
const FORBIDDEN = ["tests/", "docs/", "scripts/", ".github/", "node_modules/"];
// The plugin directory rejects overviews that carry install commands.
const OVERVIEW_COMMANDS = /paseo plugin add|npm install|\bnpm i\b/;

/** Problems with a packed tarball, given its file list and the files the registry reads. */
export function inspectPackage({ files, manifest, overview, sourceManifest }) {
  const problems = [];
  for (const file of REQUIRED) if (!files.includes(file)) problems.push(`missing ${file}`);
  for (const file of files) if (FORBIDDEN.some((prefix) => file.startsWith(prefix))) problems.push(`unexpected ${file}`);
  if (JSON.stringify(manifest) !== JSON.stringify(sourceManifest)) problems.push("paseo-plugin.json differs from the source manifest");
  if (overview !== undefined && OVERVIEW_COMMANDS.test(overview)) problems.push("OVERVIEW.md contains an install command");
  return problems;
}

function tar(tarball, ...args) {
  return execFileSync("tar", [...args, tarball], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const tarball = process.argv[2];
  if (!tarball) {
    console.error("Usage: node scripts/check-package.mjs <package.tgz>");
    process.exit(2);
  }
  const files = tar(tarball, "-tzf").split("\n").filter(Boolean).map((entry) => entry.replace(/^package\//, ""));
  const extract = (file) => (files.includes(file) ? execFileSync("tar", ["-xOzf", tarball, `package/${file}`], { encoding: "utf8" }) : undefined);
  const problems = inspectPackage({
    files,
    manifest: JSON.parse(extract("paseo-plugin.json") ?? "null"),
    overview: extract("OVERVIEW.md"),
    sourceManifest: JSON.parse(readFileSync(join(root, "paseo-plugin.json"), "utf8")),
  });
  if (problems.length) {
    console.error(`${tarball}:\n${problems.map((problem) => `  ${problem}`).join("\n")}`);
    process.exit(1);
  }
  console.log(`${tarball}: ${files.length} files, manifest and overview as expected.`);
}
