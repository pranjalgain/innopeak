import { describe, expect, test } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";


import de from "../../../messages/de.json";
import en from "../../../messages/en.json";

const SRC = join(__dirname, "../..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return name === "test" ? [] : sourceFiles(full);
    return /\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) ? [full] : [];
  });
}

function resolves(messages: unknown, path: string): boolean {
  let current: unknown = messages;
  for (const key of path.split(".")) {
    if (typeof current !== "object" || current === null || !Object.hasOwn(current, key)) return false;
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === "object";
}

// A namespace that does not exist renders the key path itself ("pageTitles.login") instead of text, and nothing else fails: it once
// shipped as the browser-tab title because the block had been inserted one level too deep.
describe("translation namespaces", () => {
  const namespaces = new Map<string, string>();
  for (const file of sourceFiles(SRC)) {
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(/(?:useTranslations|getTranslations)\(\s*"([A-Za-z0-9_.]+)"\s*\)/g)) {
      namespaces.set(match[1]!, file.replace(SRC, "src"));
    }
  }

  test("finds the namespaces the code asks for", () => {
    expect(namespaces.size).toBeGreaterThan(20);
  });

  test.each([...namespaces.entries()])("%s exists in English and German (used in %s)", (namespace) => {
    expect(resolves(en, namespace)).toBe(true);
    expect(resolves(de, namespace)).toBe(true);
  });
});
