import { describe, expect, test } from "vitest";

import de from "../../../messages/de.json";
import en from "../../../messages/en.json";
import { SUPPORTED_LOCALES } from "../locales";

/**
 * Flattens nested message objects (and arrays, which `marketing.trustBar.items` etc.
 * use) into `"a.b.c"` / `"a.b[0].c"` paths mapped to their leaf string, so two locale
 * files can be compared key-by-key regardless of nesting depth.
 */
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

/** Every top-level `{name}` / `{name, plural, ...}` / `{name, select, ...}` variable name in an ICU message. */
function icuVariables(message: string): Set<string> {
  return new Set([...message.matchAll(/\{(\w+)/g)].map(match => match[1]));
}

describe("messages/de.json", () => {
  const flatEn = flatten(en);
  const flatDe = flatten(de);

  test("declares exactly the same keys as messages/en.json", () => {
    // A missing German key isn't a silent runtime fallback here — next-intl throws on a
    // missing key by default — but this test exists so a diff is caught at PR time
    // instead of at the moment someone actually visits that screen in German.
    const missingInDe = Object.keys(flatEn).filter(key => !(key in flatDe));
    const extraInDe = Object.keys(flatDe).filter(key => !(key in flatEn));

    expect(missingInDe, `keys missing from de.json: ${missingInDe.join(", ")}`).toEqual([]);
    expect(extraInDe, `keys only present in de.json: ${extraInDe.join(", ")}`).toEqual([]);
  });

  test("uses the same ICU placeholders as the English source, per key", () => {
    // Catches the translation-time slip of dropping a `{count}` or renaming it to
    // something the calling component never passes — next-intl throws at render time
    // for a mismatch like that, but only once that screen actually renders.
    const mismatches = Object.keys(flatEn)
      .map(key => ({ key, en: icuVariables(flatEn[key]), de: icuVariables(flatDe[key] ?? "") }))
      .filter(({ en: enVars, de: deVars }) => {
        if (enVars.size !== deVars.size) return true;
        return [...enVars].some(name => !deVars.has(name));
      })
      // Spread the Sets — `JSON.stringify(new Set(["count"]))` is `{}`, so serializing them
      // directly left the failure message blank on exactly the runs where it matters, naming
      // the broken key but not which placeholder went missing.
      .map(({ key, en: enVars, de: deVars }) => ({ key, en: [...enVars], de: [...deVars] }));

    expect(mismatches, JSON.stringify(mismatches, null, 2)).toEqual([]);
  });
});

test("SUPPORTED_LOCALES has exactly one messages/*.json file per locale", () => {
  expect(SUPPORTED_LOCALES).toEqual(["en", "de"]);
});
