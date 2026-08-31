import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";
import unusedImports from "eslint-plugin-unused-imports";
import fs from "node:fs";
import path from "node:path";

const IGNORED_SORTING_DIRECTORIES = new Set([".git", ".next", ".vscode", "node_modules"]);
const directoriesToSort = getDirectoriesToSort();

const eslintConfig = [
  // Global ignores (replaces .eslintignore)
  {
    ignores: [
      ".next/**/*",
      "node_modules/**/*",
      "dist/**/*",
      "build/**/*",
      ".vercel/**/*",
      "coverage/**/*",
      "playwright-report/**/*",
      "test-results/**/*",
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypeScript,
  {
    plugins: {
      "unused-imports": unusedImports,
    },
    settings: {
      "import/resolver": {
        typescript: {
          project: ["./tsconfig.json"],
          alwaysTryTypes: true,
        },
        node: true,
      },
    },
    rules: {
      // Console logs: error (allow warn/error)
      "no-console": ["error", { allow: ["warn", "error"] }],
      "@next/next/no-html-link-for-pages": "off",
      // Keep SSR/client hydration and shadcn UI effect patterns workable under
      // eslint-plugin-react-hooks v7 compiler rules.
      "react-hooks/set-state-in-effect": "off",
      "sort-imports": [
        "error",
        {
          ignoreCase: true,
          ignoreDeclarationSort: true,
        },
      ],
      "import/order": [
        "warn",
        {
          groups: ["external", "builtin", "internal", "sibling", "parent", "index"],
          pathGroups: [
            ...directoriesToSort.map((singleDir) => ({
              pattern: `${singleDir}/**`,
              group: "internal",
            })),
            {
              pattern: "env",
              group: "internal",
            },
            {
              pattern: "theme",
              group: "internal",
            },
            {
              pattern: "public/**",
              group: "internal",
              position: "after",
            },
          ],
          pathGroupsExcludedImportTypes: ["internal"],
          alphabetize: {
            order: "asc",
            caseInsensitive: true,
          },
        },
      ],

      // "Warn me on warning": produce a *warning* when console.warn is used
      "no-restricted-properties": [
        "warn",
        { object: "console", property: "warn", message: "Avoid console.warn" },
      ],

      // Unused imports: error (fail CI/build if lint runs)
      "unused-imports/no-unused-imports": "error",
      // Delegate unused vars handling to plugin; ignore leading underscores
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "unused-imports/no-unused-vars": [
        "error",
        {
          args: "after-used",
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],

      // Duplicate imports: error
      "import/no-duplicates": ["error", { "prefer-inline": true }],
      // (optional) avoid self-imports, which often show up in cycle refactors
      "import/no-self-import": "error",

      // Prevent import cycles
      "import/no-cycle": ["error", { ignoreExternal: true, maxDepth: Infinity }],
    },
  },
];

export default eslintConfig;

function getDirectoriesToSort() {
  return fs
    .readdirSync(process.cwd(), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !IGNORED_SORTING_DIRECTORIES.has(entry.name))
    .map((entry) => entry.name)
    .filter((directory) => fs.statSync(path.join(process.cwd(), directory)).isDirectory());
}
