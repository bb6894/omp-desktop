import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { isAbsolute, relative, resolve, sep } from "node:path";

const sourceRoot = resolve(import.meta.dir, "../../../src");
const indexPath = resolve(sourceRoot, "index.html");

const expectedScripts = [
  "react.development.js",
  "react-dom.development.js",
  "babel.min.js",
  "marked.min.js",
  "highlight.min.js",
  "design/tweaks/style.js",
  "design/tweaks/use-tweaks.js",
  "design/tweaks/panel.jsx",
  "design/tweaks/controls.jsx",
  "design/ui/icons.jsx",
  "design/ui/sparks.jsx",
  "design/ui/markdown.jsx",
  "design/ui/plan-annotations.jsx",
  "design/chat/user-bubble.jsx",
  "design/chat/eval-cell.jsx",
  "design/chat/assistant-bubble.jsx",
  "design/chat/tool-card.jsx",
  "design/chat/ask-bubble.jsx",
  "design/chat/chat-view.jsx",
  "design/composer.jsx",
  "design/chrome.jsx",
  "design/panels.jsx",
  "design/harness/proposal-review.jsx",
  "design/harness/inspector.jsx",
  "model-names.js",
  "adapter.js",
  "app/harness-client.js",
  "live.js",
  "app/constants.js",
  "app/use-bridge-snapshot.jsx",
  "app-live.jsx"
];

function externalScripts(html: string): string[] {
  return [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*><\/script>/g)]
    .map((match) => match[1]);
}

test("keeps the no-bundler script dependency graph explicit and complete", () => {
  const html = readFileSync(indexPath, "utf8");
  expect(externalScripts(html)).toEqual(expectedScripts);
  for (const script of expectedScripts) {
    expect(existsSync(resolve(sourceRoot, script)), `missing script: ${script}`).toBe(true);
  }
});

test("transforms every JSX script with the vendored Babel runtime", () => {
  const require = createRequire(import.meta.url);
  const babelPath = resolve(sourceRoot, "babel.min.js");
  const Babel = require(babelPath) as {
    transform(source: string, options: { presets: string[]; filename: string }): { code?: string };
  };

  for (const script of expectedScripts.filter((path) => path.endsWith(".jsx"))) {
    const path = resolve(sourceRoot, script);
    const result = Babel.transform(readFileSync(path, "utf8"), {
      presets: ["react"],
      filename: script
    });
    expect(typeof result.code, `Babel produced no code for ${script}`).toBe("string");
  }
});

test("keeps all referenced frontend files inside the static source root", () => {
  for (const script of expectedScripts) {
    const path = resolve(sourceRoot, script);
    const relativePath = relative(sourceRoot, path);
    expect(
      relativePath !== "" &&
      relativePath !== ".." &&
      !relativePath.startsWith(`..${sep}`) &&
      !isAbsolute(relativePath),
      `script escapes source root: ${script}`
    ).toBe(true);
  }
});
