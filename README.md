# Dash Contract Visualizer

An interactive **UML / Merise** diagram of any Dash Platform **data contract**. Fetch a
contract by id (or paste its JSON) and see its document types as draggable entity
tables: fields, **indexes**, the settings of each type, and the **references** between
them, on a pan/zoom canvas.

- **Read-only.** Queries are proof-verified via the [Evo SDK](https://www.npmjs.com/package/@dashevo/evo-sdk) (trusted mode). No wallet, no writes.
- **Protocol version 14 aware.** Reads the full Platform 4.2 contract language: declared references (`refersTo`), typed arrays, `ttl`, `immutable`, `propertyConstraints`, action fees, moderation, ranked and time-range indexes, index-only types and the rest. See [What the diagram shows](#what-the-diagram-shows).
- **Two notations**, toggle any time: **UML** class diagram and **Merise** (conceptual) view.
- **Static.** Vite + React + TS, WASM inlined → deploys to GitHub Pages with no backend.
- **Offline-capable.** Paste contract JSON or open a bundled example without any network.

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
```

Then either:
- open one of the **Examples** (or visit `?example=marketplace`, `?demo=1` for the default);
- pick a **network**, paste a **contract id**, and click **Load** (a devnet also needs its name, e.g. `moutai`);
- put a **link to a contract JSON file** in the same box, or open `?url=<link>`: handy for a contract in a pull request that is not registered yet. GitHub page links (`github.com/<owner>/<repo>/blob/<ref>/<path>`) are fetched from `raw.githubusercontent.com`; any other host must allow cross-origin reads; or
- click **Paste JSON** to diagram a contract (or a bare document-schemas block) locally, handy while authoring a schema before it is registered.

## How relationships work

Since protocol version 14 a contract can **declare** what an identifier points at, and the
platform checks it whenever a document is written. Those declarations are drawn as solid
edges, coloured by what they point at, leaving from the exact field that declares them:

| Declaration | Edge |
|---|---|
| `refersTo` on a property | from that field, to a document type of this contract, another contract's document type, or a platform object (identity, identity key, data contract, token) |
| `refersTo` on a typed array's `items` | from the array field, multiplicity `0..∗` / `(0,n)` |
| `ownerRefersTo` / `creatorRefersTo` | from the `$ownerId` / `$creatorId` row, labelled `«owner»` / `«creator»` |
| `anyOf` / `allOf` | one edge per operand, labelled `anyOf 1/2`, `anyOf 2/2`, … |
| `lookup` | labelled `via <index>` |
| `listElement` | ends on the list field of the target, labelled `∈ <list>` |
| `deletableDocument` | labelled `deletable` (checked again on every replace) |

An optional field gives `0..1` / `(0,1)`, a required one `1` / `(1,1)`. Other contracts'
document types get their own node (system contracts are named, e.g. **DPNS**), with an
**Open this contract** button in the inspector.

Fields that declare nothing still get the old naming heuristics, drawn **dashed** and
labelled *inferred*: an identifier named `<x>Id` / `<x>Ref` → the type `<x>`, a field named
like another type's single-field unique key, or two types indexing the same user field.
System fields (`$ownerId`, `$createdAt`) never produce an inferred edge. Treat inferred
edges as hints; hide any edge from the inspector, or a whole kind from the legend.

## What the diagram shows

Every keyword links to its chapter of [The Dash Platform Book](https://dashpay.github.io/platform/contract-keywords.html) from the inspector.

- **Document type chips** under each header: `ttl 30d`, `no edits`, `no delete`, `mods delete ≤1w`, `owner creates`, `transferable`, `for sale`, `history`, `logged` (transfer / purchase / pricing history), `fees` (`actionFees`), `token cost`, `count` / `Σ x` / `id ranges`, `sig critical`, `enc keys` / `dec keys`. An **index-only** type has a dashed border and the `«index-only type»` stereotype.
- **Fields**: required dot, `key` / `ix` markers, a coloured `→` for a declared reference, and chips for `fixed` (`immutable`), `set once` (`immutableAllowSetting`), `transient`, `v2+` (`requiredSince`), `enc` (`encryptedFor`), `≠ $ownerId` (`distinctFrom`) and `payload` (`entryPayload`). Nested objects are indented under their parent; typed arrays show as `string[]`, `identifier[]`; a `$ref` shows its `schemaDefs` name.
- **Indexes**: fields in order plus chips for `contested`, `count`, `Σ x`, `range`, `top-K count/sum/avg` (ranked), `window 1d/1h` (`timeRange`), `→ $ownerId` (`terminal`), `prealloc`, `skip absent`, `no nulls`.
- **Property constraints** get their own compartment, rendered as formulas: `rewardSplit.leader + rewardSplit.equal + rewardSplit.actions = 100`.
- **Contract metadata** (top-left): id, owner, version, timestamps, keywords, description, config, **moderation** (lists, who moderates, election windows, moderated types), `schemaDefs`, and every type's chips.

## Examples

Bundled, offline, and each one passes full validation by the protocol version 14 parser
(`DataContract.fromJSON(json, true, 14)` from `@dashevo/evo-sdk`), checked in CI:

| Key | What it shows |
|---|---|
| `marketplace` | An illustrative contract, not registered anywhere, that uses the protocol 14 keywords together |
| `moderation-charters` | The system contract behind elected moderation: lookups, list elements, property agreements, an `anyOf` `ownerRefersTo`, encrypted join requests |
| `yappr-likes` | Index-only types from the Drive test suite: terminals, preallocated trees, ranked and time-range indexes |
| `dpns`, `dashpay`, `app-connect`, `keyword-search`, `withdrawals` | System contracts, as in the platform repo |
| `dash-qa` | A contract with no declared references, so every edge is inferred |

`npm run validate:examples` validates them and checks `src/model/fixtures/sdk-references.json`,
the SDK's own reading of their references, which the unit tests compare the diagram's
parser against (`-- --write` regenerates it after an SDK bump or a new example).

## Interaction, export, deep links

- **Drag** entities; pan/zoom; minimap; **re-layout** (elk auto-layout) button.
- Click any field / index / constraint / entity / edge / external node for details in the inspector.
- Legend (bottom) with filters: declared, inferred, platform objects.
- **Export** the diagram to PNG or SVG.
- Deep links: `?contract=<id>&network=testnet&view=uml`, `?contract=<id>&network=devnet&devnet=moutai`, `?url=<link to a contract JSON file>`, `?example=<key>` (and `?demo=1`), shareable; the URL updates as you load contracts. For example, a contract file in a pull request: `https://dashpay.github.io/contract-visualizer/?url=https://github.com/<owner>/<repo>/blob/<commit>/contracts/<file>.json`.

The Vite dev server reads `?url` as its own asset-import query; a small dev-only plugin in `vite.config.ts` serves the app for such page requests. Static hosting needs nothing.

## SDK version

`@dashevo/evo-sdk` is pinned to **4.2.0-beta.4**. It reads contracts from networks on
protocol version 14 (4.2 devnets) as well as testnet and mainnet. Earlier 4.x SDKs cannot
decode the version 2 contract config that 4.2 networks serialize. `4.2.0-beta.5` on npm
depends on a `@dashevo/wasm-sdk` that was never published, so it does not install.

## Scripts

```bash
npm run dev                # dev server (serves from / locally)
npm run build              # typecheck + production build to dist/
npm run preview            # serve the production build
npm test                   # unit tests
npm run typecheck          # tsc, no emit
npm run validate:examples  # examples through the platform parser; fixture freshness
```

## Deployment (GitHub Pages)

[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) typechecks, tests, validates
the examples, builds, and publishes `dist/` to Pages on push to `main`. The build base path
is `/contract-visualizer/` (the repo name); set `VITE_BASE=/` for a custom domain or Vercel.
Optionally set the `CONTRACT_ID` / `NETWORK` repository variables to pre-load a contract on
first paint.

One-time: repo settings → **Pages → Source: GitHub Actions**.

## Project structure

```
src/
  config.ts              # contract id / example / link + network + view resolution (URL / localStorage / env)
  urlSource.ts           # ?url= and pasted links: GitHub blob -> raw, fetch + parse
  sdk/
    client.ts            # Evo SDK trusted connection, memoised per network
    contract.ts          # fetch contract (toJSON) -> ContractModel, or a bundled example
  examples/              # bundled example contracts + registry
  model/
    introspect.ts        # document schemas -> ContractModel (fields, indexes, keywords)
    references.ts        # refersTo / ownerRefersTo / creatorRefersTo -> declared edges
    relationships.ts     # declared + inferred relationships
    constraints.ts       # propertyConstraints -> formulas
    describe.ts          # keyword chips and plain-language descriptions
    types.ts
    fixtures/            # the SDK's reading of the examples' references
  flow/
    diagramToFlow.ts     # model + view + filters -> React Flow nodes/edges
    layout.ts            # elk layered auto-layout
    EntityNode.tsx       # document type card (UML / Merise rendering)
    ExternalNode.tsx     # identity / key / contract / token / other contract's type
    Canvas.tsx           # React Flow canvas, legend, export/re-layout panel
    selection.ts, exportImage.ts
  components/            # Toolbar, InspectorPanel, ContractMetaPanel, PasteContractModal
  App.tsx, main.tsx, styles.css
scripts/
  validate-examples.mjs  # examples through DataContract.fromJSON(…, true, 14)
```

## License

MIT
