// Validate every bundled example with the platform's own parser and check
// (or, with --write, regenerate) the references fixture the unit tests
// compare against.
//
//   npm run validate:examples            # fail if an example is invalid or the fixture is stale
//   npm run validate:examples -- --write # regenerate src/model/fixtures/sdk-references.json
//
// DataContract.fromJSON(json, fullValidation = true, 14) runs the protocol
// version 14 parser (try_from_schema) as @dashevo/evo-sdk compiles it. The SDK
// is built without dpp's `validation` feature, so the document meta-schema and
// the parser checks gated behind that feature do not run here.

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DataContract, ensureInitialized } from '@dashevo/evo-sdk';

const PROTOCOL_VERSION = 14;
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const examplesDir = join(root, 'src/examples');
const fixturePath = join(root, 'src/model/fixtures/sdk-references.json');

await ensureInitialized();

const references = {};
let failed = false;
for (const file of readdirSync(examplesDir).filter((f) => f.endsWith('.json')).sort()) {
  const key = file.replace(/\.json$/, '');
  try {
    const contract = DataContract.fromJSON(JSON.parse(readFileSync(join(examplesDir, file), 'utf8')), true, PROTOCOL_VERSION);
    const refs = {};
    for (const [type, list] of contract.documentReferences) refs[type] = list.map((r) => ({ path: r.path, type: r.type }));
    references[key] = refs;
    const count = Object.values(refs).reduce((n, l) => n + l.length, 0);
    console.log(`ok    ${key}: ${Object.keys(contract.schemas).length} document types, ${count} references`);
  } catch (err) {
    failed = true;
    console.error(`FAIL  ${key}: ${err?.message ?? err}`);
  }
}
if (failed) process.exit(1);

const text = `${JSON.stringify(references, null, 2)}\n`;
if (process.argv.includes('--write')) {
  writeFileSync(fixturePath, text);
  console.log(`wrote ${fixturePath}`);
} else if (readFileSync(fixturePath, 'utf8') !== text) {
  console.error('src/model/fixtures/sdk-references.json is stale: run `npm run validate:examples -- --write`');
  process.exit(1);
}
