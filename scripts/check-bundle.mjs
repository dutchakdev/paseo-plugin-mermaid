#!/usr/bin/env node
// Compiles the client entry with the installed Paseo daemon's own compiler and runs
// the bundle against two stand-in apps: one without the 0.13 additions (Paseo's
// Markdown component, file panels), as on Paseo 0.11 and 0.12, and one with them.
// The SDK types are 0.13's, so typechecking cannot show that an older app still
// loads the plugin; this does.
//
// Usage: node scripts/check-bundle.mjs [path/to/@getpaseo/server/.../plugins/compiler.js]
// Without an argument it uses the server package of the `paseo` CLI on PATH.

import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runInThisContext } from "node:vm";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function findCompiler() {
  const cli = realpathSync(execFileSync("which", ["paseo"], { encoding: "utf8" }).trim());
  const cliPackage = resolve(dirname(cli), "..");
  return join(cliPackage, "node_modules/@getpaseo/server/dist/server/server/plugins/compiler.js");
}

const compilerPath = process.argv[2] ?? findCompiler();
const { compileDirectoryPlugin } = await import(compilerPath);
const { clientBundle } = await compileDirectoryPlugin(root, "0.13.2");
const zod = createRequire(join(root, "package.json"))("zod");

// Everything the bundle requires that this check does not inspect answers with a no-op.
const inert = new Proxy({}, { get: (_target, key) => (key === "__esModule" ? false : () => null) });
const react = { createElement: () => null, useMemo: (make) => make(), useState: (value) => [value, () => {}], useRef: () => ({}), useEffect: () => {}, useCallback: (fn) => fn };

function load(app) {
  const registered = [];
  const ui = app.markdown ? { Markdown: () => null } : {};
  const require = (id) => {
    if (id === "zod") return zod;
    if (id === "react") return react;
    if (id === "@getpaseo/plugin/client/ui") return ui;
    return inert;
  };
  // The bundle is this plugin's own code, compiled just now; the app evaluates the same text.
  const exported = runInThisContext(clientBundle, { filename: "mermaid.client.js" })(require);
  const contribute = exported.default ?? exported;
  const client = {
    addTimelineTransformer: (contribution) => registered.push(`transformer ${contribution.id}`),
    addTimelineRenderer: (contribution) => registered.push(`renderer ${contribution.kind}`),
  };
  if (app.filePanels) client.addFilePanel = (contribution) => (registered.push(`file panel ${contribution.id}`), () => {});
  contribute(client);
  return registered;
}

const timeline = ["transformer mermaid-assistant", "transformer mermaid-user", "renderer mermaid-diagram", "renderer mermaid-text"];
const cases = [
  { name: "Paseo 0.11 and 0.12", app: { markdown: false, filePanels: false }, expected: timeline },
  { name: "Paseo 0.13 and later", app: { markdown: true, filePanels: true }, expected: [...timeline, "file panel mermaid-file"] },
];

let failed = false;
for (const { name, app, expected } of cases) {
  try {
    const registered = load(app);
    const ok = JSON.stringify(registered) === JSON.stringify(expected);
    failed ||= !ok;
    console.log(`${ok ? "ok  " : "FAIL"} ${name}: ${registered.join(", ")}`);
  } catch (error) {
    failed = true;
    console.log(`FAIL ${name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
process.exit(failed ? 1 : 0);
