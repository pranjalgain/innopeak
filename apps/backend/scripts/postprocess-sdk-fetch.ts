// Post-processing for the generated fetch client SDK (run by `generate:sdk:fetch`, before its
// own `npm run build`). Works around a known typescript-fetch generator template bug: multipart
// form endpoints with an object-typed field (e.g. media upload's `metadata` alongside the file)
// call a bare `objectToJSON(...)` helper that the generator references but never defines or
// imports, causing `tsc` to fail with "Cannot find name 'objectToJSON'". We inject the helper
// into runtime.ts and import it wherever it's referenced.
import * as fs from 'node:fs';
import * as path from 'node:path';

const sdkDir = path.resolve(__dirname, '../client_sdk');
const runtimePath = path.join(sdkDir, 'src', 'runtime.ts');
const apisDir = path.join(sdkDir, 'src', 'apis');

const OBJECT_TO_JSON_HELPER = `
export function objectToJSON(value: any): any {
    if (value instanceof Date) {
        return value.toISOString();
    } else if (Array.isArray(value)) {
        return value.map(objectToJSON);
    } else if (value !== null && typeof value === 'object') {
        return Object.keys(value).reduce(
            (acc, key) => ({ ...acc, [key]: objectToJSON(value[key]) }),
            {}
        );
    } else {
        return value;
    }
}
`;

if (fs.existsSync(apisDir)) {
  let runtimeContent = fs.readFileSync(runtimePath, 'utf8');
  if (!runtimeContent.includes('export function objectToJSON')) {
    runtimeContent = `${runtimeContent.trimEnd()}\n${OBJECT_TO_JSON_HELPER}`;
    fs.writeFileSync(runtimePath, runtimeContent);
  }

  for (const entry of fs.readdirSync(apisDir)) {
    if (!entry.endsWith('.ts')) {
      continue;
    }
    const filePath = path.join(apisDir, entry);
    let content = fs.readFileSync(filePath, 'utf8');
    if (!content.includes('objectToJSON(') || content.includes('import { objectToJSON }')) {
      continue;
    }

    content = content.replace(
      "import * as runtime from '../runtime';",
      "import * as runtime from '../runtime';\nimport { objectToJSON } from '../runtime';"
    );
    fs.writeFileSync(filePath, content);
  }
}
