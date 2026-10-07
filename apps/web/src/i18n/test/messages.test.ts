import { describe, expect, test } from "vitest";

import de from "../../../messages/de.json";
import en from "../../../messages/en.json";
import { SUPPORTED_LOCALES } from "../locales";

function flatten(value: unknown, prefix = ""): Record<string, string> {
  if (Array.isArray(value)) {
    return value.reduce<Record<string, string>>(
      (acc, item, index) => ({ ...acc, ...flatten(item, `${prefix}[${index}]`) }),
      {}
    );
  }

  if (value !== null && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).reduce<Record<string, string>>(
      (acc, [key, child]) => ({ ...acc, ...flatten(child, prefix ? `${prefix}.${key}` : key) }),
      {}
    );
  }

  return { [prefix]: String(value) };
}

function icuVariables(message: string): Set<string> {
  return new Set([...message.matchAll(/\{(\w+)/g)].map(match => match[1]));
}

describe("messages/de.json", () => {
  const flatEn = flatten(en);
  const flatDe = flatten(de);

  test("declares exactly the same keys as messages/en.json", () => {
    // next-intl throws on a missing key at runtime; this catches it at PR time instead of when someone visits that screen in German.
    const missingInDe = Object.keys(flatEn).filter(key => !(key in flatDe));
    const extraInDe = Object.keys(flatDe).filter(key => !(key in flatEn));

    expect(missingInDe, `keys missing from de.json: ${missingInDe.join(", ")}`).toEqual([]);
    expect(extraInDe, `keys only present in de.json: ${extraInDe.join(", ")}`).toEqual([]);
  });

  test("uses the same ICU placeholders as the English source, per key", () => {
    // next-intl only throws on a dropped or renamed placeholder once that screen renders; this catches it earlier.
    const mismatches = Object.keys(flatEn)
      .map(key => ({ key, en: icuVariables(flatEn[key]), de: icuVariables(flatDe[key] ?? "") }))
      .filter(({ en: enVars, de: deVars }) => {
        if (enVars.size !== deVars.size) return true;
        return [...enVars].some(name => !deVars.has(name));
      })
      // Spread the Sets: `JSON.stringify(new Set(...))` is `{}`, which blanks the failure message.
      .map(({ key, en: enVars, de: deVars }) => ({ key, en: [...enVars], de: [...deVars] }));

    expect(mismatches, JSON.stringify(mismatches, null, 2)).toEqual([]);
  });
});

test("SUPPORTED_LOCALES has exactly one messages/*.json file per locale", () => {
  expect(SUPPORTED_LOCALES).toEqual(["en", "de"]);
});
