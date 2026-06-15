# Dash Contract Visualizer

An interactive **UML / Merise** diagram of any Dash Platform **data contract**. Fetch a
contract by id (or paste its JSON) and see its document types as draggable entity
tables — fields, **indexes**, and inferred relationships — on a pan/zoom canvas.

- **Read-only.** Queries are proof-verified via the [Evo SDK](https://www.npmjs.com/package/@dashevo/evo-sdk) (trusted mode). No wallet, no writes.
- **Two notations**, toggle any time: **UML** class diagram and **Merise** (conceptual) view.
- **Static.** Vite + React + TS, WASM inlined → deploys to GitHub Pages with no backend.
- **Offline-capable.** Paste contract JSON or load the bundled demo without any network.

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
```

Then either:
- click **Demo** (or visit `?demo=1`) to render the bundled `dash-qa` contract offline;
- pick a **network**, paste a **contract id**, and click **Load**; or
- click **Paste JSON** to diagram a contract (or a bare document-schemas block) locally — handy while authoring a schema before it's registered.

## How relationships work (important)

Dash data contracts have **no foreign keys** — each document type is an independent JSON
schema. UML and Merise are relational notations, so every edge here is **inferred**, never
read from the contract, and is labelled as such + editable (click an edge → hide it):

- an identifier-typed field named `<x>Id` / `<x>Ref` → the entity `<x>`;
- a field whose name matches another type's single-field **unique index** (e.g. `testRun.testId` ↔ `testCase.testId`);
- two types that index the same field name (weak, low confidence).

Treat inferred edges as hints, not ground truth.

## Views & indexes

- **UML:** each document type is a class — `name «document type»`, an attribute compartment
  (`name : type`, required dot, unique `key` / indexed `ix` markers, system `$`-fields), and a
  dedicated **indexes** compartment (`name · fields · unique`). Associations show `∗ — 1`.
- **Merise:** entities with the unique-key field underlined as the identifier; associations
  show `(0,n) — (1,1)` cardinalities.

Indexes are first-class in both: every index lists its ordered fields (with sort direction —
Dash registers `asc` only), and unique indices are flagged.

## Interaction, export, deep links

- **Drag** entities; pan/zoom; minimap; **re-layout** (elk auto-layout) button.
- Click any field / index / entity / edge for full constraints in the inspector.
- **Export** the diagram to PNG or SVG.
- Deep links: `?contract=<id>&network=testnet&view=uml` (and `?demo=1`) — shareable, and the URL updates as you load contracts.

## Scripts

```bash
npm run dev        # dev server (serves from / locally)
npm run build      # typecheck + production build to dist/
npm run preview    # serve the production build
npm test           # unit tests (introspection + relationship inference)
npm run typecheck  # tsc, no emit
```

## Deployment (GitHub Pages)

[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) typechecks, tests, builds, and
publishes `dist/` to Pages on push to `main`. The build base path is `/contract-visualizer/`
(the repo name); set `VITE_BASE=/` for a custom domain or Vercel. Optionally set the
`CONTRACT_ID` / `NETWORK` repository variables to pre-load a contract on first paint.

One-time: repo settings → **Pages → Source: GitHub Actions**.

## Project structure

```
src/
  config.ts              # contract id + network + view resolution (URL / localStorage / env)
  sdk/
    client.ts            # Evo SDK trusted connection, memoised per network
    contract.ts          # fetch contract -> ContractModel (+ demo short-circuit)
  model/
    introspect.ts        # contract.schemas -> ContractModel (fields, indexes, constraints)
    relationships.ts     # heuristic relationship inference (pure, unit-tested)
    types.ts, demo.ts
  flow/
    diagramToFlow.ts      # model + view -> React Flow nodes/edges
    layout.ts             # elk layered auto-layout
    EntityNode.tsx        # entity card (UML / Merise rendering)
    Canvas.tsx            # React Flow canvas + export/re-layout panel
    selection.ts, exportImage.ts
  components/             # Toolbar, InspectorPanel, PasteContractModal
  App.tsx, main.tsx, styles.css
```

## License

MIT
