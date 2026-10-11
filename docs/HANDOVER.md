# Developer and owner handover

## Development and builds

Use Node 24 LTS. `npm ci` installs pinned dependencies from the lockfile. `npm run build` checks TypeScript, bundles the client, generates public help pages, measures compressed assets, and builds the offline shell. `npm run preview` serves production on port 3000. `npm run dev` uses port 3001 and disables service-worker registration, avoiding interference from the production offline cache.

Keep the same browser origin while testing; localhost and 127.0.0.1 have separate IndexedDB stores. After rebuilding, an existing production tab may show an update prompt. Save and update to activate the new shell. Do not clear browser data to update an app containing valuable drafts; export first.

## Architecture

- `model.ts`: canonical draft/document types, caps, schema validation and imports.
- `editor.ts`: Tiptap/ProseMirror extensions, plain insertion, list metadata, history and literal find/replace.
- `unicode.ts`: Unicode tables, protected tokens across runs, native/bundled segmentation, deterministic serializer, counts and readiness checks.
- `operations.ts`: spacing, pasted-list cleanup, conservative Markdown parser handling, imported-style reverse mapping and original templates.
- `storage.ts`: IndexedDB transactions, revision CAS checks, bounded recovery, backup restore and legacy migration.
- `useWorkbench.ts`: hydration, autosave, active-draft management, tab coordination, memory fallback, settings and snippets.
- `ui/`: accessible dialogs, responsive editor/preview, tool panels and draft workflows.
- `offline.ts` and `scripts/build-offline.mjs`: registration, waiting-worker prompt, safe activation, versioned static precache and public metadata.

All output comes from the canonical ordinary text and marks. Preview and formatted copy share the serializer; no HTML copy path exists. Imported Unicode is preserved until explicitly converted. HTML paste flattening uses an inert template fragment only when an HTML-only clipboard lacks plain text; it never attaches imported elements to the document.

## Configuration and limits

Edit `src/config.ts` for product identity, limits, timings, widths and advisory thresholds. Set the final HTTPS origin in `.env.local` using `VITE_PUBLIC_URL` for canonical URLs and sitemap. The build rejects credentials, queries and fragments in that setting. Static assets assume root hosting.

Limits: 50 drafts; 20,000 source UTF-16 units each; 30 snippets of 1,000 units; 1 MB JSON import; last three successful revisions per draft; at least 100 history groups in the active session. Continuous typing follows ProseMirror grouping. Repeated/newline spacing is preserved unless the user applies a named command. JSON schemas are in `schemas/`; runtime validation also enforces aggregate source length, unique IDs and mutually exclusive overlays.

Exported collections can exceed the 1 MB import cap when many maximum-size drafts are stored. Retain the full raw backup, and export individual editable drafts for separate restores. Do not silently truncate a backup or relax import validation. A future multipart backup format needs a separately versioned schema and tests.

## Data durability and privacy

Drafts, revision snapshots, preferences, recent emoji identifiers and snippets live in IndexedDB `sriram-linkedin-formatter`. `Saved locally` appears only after the transaction commits. Browser unload flushing is best effort; clearing browser storage loses drafts. Storage is not encrypted. Memory fallback supports editing and export but cannot guarantee reload durability.

Saving compares the expected revision inside the same read/write transaction. BroadcastChannel provides prompt conflict notices; revision checks are authoritative even when broadcast is absent. Conflicts pause saves and offer a new copy or saved-version reload. Destructive whole-store operations pause autosave and wait for in-flight writes.

The supported migration is legacy schema 0 `{ id, title, text }` to schema 1, with the old payload retained in `migrationBackup`. Unknown/corrupt schemas are never automatically rewritten. Access the raw backup through Drafts. Recoverable saved revisions restore as new drafts rather than replacing existing ones.

Draft content never enters network requests, URLs, telemetry or application logs. Emoji metadata is fetched only from the app origin. The service worker caches static assets only. `_headers` supplies deployment CSP and security headers; the HTML also includes CSP for local preview. No browser clipboard read occurs in the app.

## Offline and dependency maintenance

The production service worker precaches all shell files and emoji metadata before becoming ready. An update waits for explicit save/activation. Failed precaching leaves the previous working cache available. Same-origin static lookups ignore Vary headers so precached scripts remain available offline across CORS-mode differences.

Review package and cache changes each release. Update pinned dependencies deliberately, run `npm audit`, and re-run all automated checks. Rebuild emoji data using `npm run prepare:emoji`; dataset source and licence are pinned to emoji-datasource 16.0.0. Regenerate Unicode goldens only after reviewing Unicode character assignments. `scripts/generate-unicode-fixtures.py` uses independent Unicode names, not application offsets.

## Owner responsibilities and release status

The owner selects the final domain and brand, approves product copy and release, and organises real device/LinkedIn paste and usability testing. The developer maintains mappings, parser boundaries, tests, compatibility evidence, licences and service-worker updates. The app is a local beta until the human launch checklist is satisfied. Keep the plain-text fallback visible during compatibility investigations. Future telemetry, account access, AI, scheduling and cloud sync require separate scope and consent.
