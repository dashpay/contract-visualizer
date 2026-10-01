// Validate every bundled example with the platform's own parser and check
// (or, with --write, regenerate) the fixtures the unit tests compare against:
// the references the SDK reads, and the GroveDB layouts and create costs
// Drive computes for a few document types.
//
//   npm run validate:examples            # fail if an example is invalid or a fixture is stale
//   npm run validate:examples -- --write # regenerate src/model/fixtures/*.json
//
// DataContract.fromJSON(json, fullValidation = true, 14) runs the protocol
// version 14 parser (try_from_schema) as @dashevo/evo-sdk compiles it. The SDK
// is built without dpp's `validation` feature, so the document meta-schema and
// the parser checks gated behind that feature do not run here.

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DataContract, PlatformVersion, documentCreateCost, documentTypeLayout, ensureInitialized } from '@dashevo/evo-sdk';

const PROTOCOL_VERSION = 14;
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const examplesDir = join(root, 'src/examples');
const fixturesDir = join(root, 'src/model/fixtures');
/** The document types whose layout and cost the unit tests read, as `<example>:<type>`. */
const DRIVE_FIXTURES = ['marketplace:listing', 'yappr-likes:tip', 'dpns:domain'];

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

// The layout and cost computed with the latest platform version, as the app
// asks for them (src/sdk/local.ts).
const platformVersion = PlatformVersion.latest();
const layouts = {};
const costs = {};
for (const key of DRIVE_FIXTURES) {
  const [example, type] = key.split(':');
  const contract = DataContract.fromJSON(JSON.parse(readFileSync(join(examplesDir, `${example}.json`), 'utf8')), false, platformVersion);
  layouts[key] = documentTypeLayout(contract, type, platformVersion);
  costs[key] = documentCreateCost(contract, type, {}, platformVersion);
}

const fixtures = {
  'sdk-references.json': references,
  'document-type-layouts.json': layouts,
  'document-create-costs.json': costs,
};
let stale = false;
for (const [file, value] of Object.entries(fixtures)) {
  const path = join(fixturesDir, file);
  const text = `${JSON.stringify(value, null, 2)}\n`;
  if (process.argv.includes('--write')) {
    writeFileSync(path, text);
    console.log(`wrote ${path}`);
  } else if (readFileSync(path, 'utf8') !== text) {
    console.error(`src/model/fixtures/${file} is stale: run \`npm run validate:examples -- --write\``);
    stale = true;
  }
}
if (stale) process.exit(1);
