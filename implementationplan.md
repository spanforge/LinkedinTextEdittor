# LinkedIn Text Formatter implementation plan

Based on `LinkedIn_Text_Formatter_Application_Specification.docx`, version 1.1, dated 11 October 2026.

Status: application features implemented as a local beta. Automated validation and handover evidence are recorded in `docs/release-evidence/` and `docs/HANDOVER.md`. Real-device, screen-reader, LinkedIn composer and moderated usability launch gates remain pending in `docs/LAUNCH_CHECKLIST.md`; the build is not yet approved for public release.

## 1. Product scope and completion rule

Build **LinkedIn Text Formatter by Sriram Advisory** as a client-only application using React, TypeScript, Vite, Tiptap and ProseMirror. Users edit ordinary source characters with visual marks, inspect the exact Unicode export, and copy it for manual posting on LinkedIn. No signup is required.

The complete first release includes all requirements in sections 1–11 of the specification, including its later additions: Markdown cleanup, snippets, find and replace, recovery revisions, tab conflict handling, readiness checks, and installable offline support. The four delivery milestones in section 12 are expanded below to make these requirements explicit. Intermediate builds remain beta until all launch gates pass.

Exclude a backend, cloud accounts, automatic publishing, scheduling, LinkedIn authentication or scraping, AI rewriting, third-party analytics, draft sharing through URLs, and additional decorative alphabets. Export must never append branding, attribution, or links.

## 2. Foundation and technical decisions

- Validate current official APIs and compatible versions during setup, then pin dependencies and commit the lockfile. This plan does not assert that dependency APIs or LinkedIn limits have already been verified.
- Use Tiptap transactions for selection, marks, composition, history, and document changes. Build a custom serializer; editor HTML is never the exported post.
- Use an IndexedDB adapter for drafts, preferences, snippets, recent emoji identifiers, and recovery revisions. Keep usable in-memory editing when persistence fails.
- Use a unit-test runner such as Vitest, browser integration tests, and Playwright. Use real devices and screen readers for behaviour that browser automation cannot establish.
- Bundle a licensed, version-pinned emoji metadata dataset and Unicode mapping fixtures. Lazy-load the picker data while precaching it for offline use.
- Build a versioned service worker and web app manifest for optional installation and offline startup after a successful initial load.

Proposed source boundaries:

```text
src/
  config/          Product identity, limits, widths, thresholds, dataset versions
  model/           Canonical document, draft types, validation, migration
  editor/          Tiptap extensions, selection, composition, transaction adapters
  operations/      Lists, spacing, cleanup, find/replace, snippets, reset
  unicode/         Mapping tables, reverse mappings, segmentation, token protection
  export/          Serializer, counts, clipboard, text/JSON downloads
  checks/          Readiness checks and substitution inspection
  storage/         IndexedDB, autosave, revisions, conflict coordination
  emoji/           Metadata adapter, search, tones, recent selections
  ui/              Editor, preview, toolbars, dialogs, draft management
  content/         Original templates, help, privacy, compatibility information
  offline/         Cache lifecycle and safe update coordination
tests/
  fixtures/        Unicode goldens, documents, imports, malformed inputs
  unit/            Pure transformations and validators
  integration/     Editing, persistence, history, recovery, migrations
  e2e/             Browser workflows, clipboard, offline, privacy
docs/
  release-evidence/ Browser/device results and launch sign-off
```

Keep configuration in one typed module: product name, deployment URL, 3,000 exported UTF-16 unit advisory threshold, 90% caution threshold, 360/600 px preview widths, 768 px mobile breakpoint, 1,200 px content width, 20,000 source-unit cap, 50 drafts, 30 snippets, 1,000 units per snippet, 1 MB JSON import cap, 800 ms autosave delay, 150 ms expensive-check debounce, three recovery revisions, minimum 100 history transactions, and guidance thresholds. Treat the LinkedIn threshold as an estimate until validated at launch.

## 3. Canonical document and output contract

Define a versioned draft containing `schemaVersion`, `id`, `title`, `createdAt`, `updatedAt`, monotonic `revision`, `editorDocument`, and `preferences`. Persist a valid last-active draft and caret separately for resume behaviour. Validate a saved caret before restoring it.

The document contains paragraphs, hard breaks, text runs, marks, and paragraph-level list metadata. Bold and italic are independent marks with a consistent family attribute; underline and strike are mutually exclusive. Emojis remain literal source text. Paragraph separators cannot carry inline marks. Define one canonical representation for hard breaks, blank paragraphs, and intentional trailing newlines before implementing imports and exports.

Maintain one list type per paragraph. Emit prefixes only during serialization. Number consecutive nonempty selected list paragraphs from 1 and restart after a blank paragraph. Counts, warnings, and exported strings are derived rather than authoritative stored data.

Serializer pipeline:

1. Read the canonical document and construct source lines, list prefixes, and run offsets.
2. Detect protected tokens across adjacent marked runs before character conversion.
3. Segment into grapheme clusters using `Intl.Segmenter` or a tested bundled fallback.
4. Map eligible ASCII letters and supported digits according to marks and family.
5. Add at most one permitted overlay to each eligible source grapheme.
6. Join exact output, preserving intentional whitespace and final newlines.
7. Derive grapheme counts, UTF-16 counts, readiness checks, and inspection metadata.

Both preview and formatted copy consume this output. Plain copy/export serializes ordinary source text with explicit list prefixes and line breaks, without generated style characters; preserved imported characters remain until the user accepts cleanup.

Mapping fixtures must cover all 52 ASCII letters and 10 digits for these combinations:

| Style | Uppercase start | Lowercase start | Digits |
| --- | --- | --- | --- |
| Sans bold | U+1D5D4 | U+1D5EE | U+1D7EC |
| Sans italic | U+1D608 | U+1D622 | Unchanged |
| Sans bold italic | U+1D63C | U+1D656 | Sans bold digits |
| Serif bold | U+1D400 | U+1D41A | U+1D7CE |
| Serif italic | U+1D434 | U+1D44E | Unchanged; lowercase h is U+210E |
| Serif bold italic | U+1D468 | U+1D482 | Serif bold digits |

Use `String.fromCodePoint`. Preserve unsupported clusters exactly: no transliteration, whole-document NFKC normalization, or arbitrary combining-mark removal. Protect HTTP/HTTPS URLs, www domains, email addresses, Unicode hashtags, and @name text, including tokens spanning runs. Distinguish terminal punctuation and preserve uncertain URL-like text with a notice.

Strike uses U+0336 and underline U+0332 on eligible ASCII letters, digits, or punctuation only. Skip protected tokens, whitespace, emoji, non-ASCII scripts, and clusters already containing combining marks. Determine overlay eligibility from source characters before mathematical substitution. Never transform a previous export.

## 4. Milestone 1 — Establish foundations and prove editing risks

### Work

- Scaffold the static application, type checking, build scripts, test tools, and configuration module. Confirm dependency licences and bundle implications.
- Implement canonical schema, document validation, fixture format, and lossless plain serialization.
- Prototype ordinary-source editing with visual marks, accessible editor naming, saved selection, keyboard shortcuts, and history.
- Verify mouse, keyboard, and touch selection survives toolbar and dialog interactions.
- Suppress transformation and persistence of partial IME input; commit after composition ends. Test Tamil alongside English and complex emoji.
- Enforce the 20,000 UTF-16 source-unit limit for every inserting operation. Normalize CRLF/CR to LF and reject oversized insertions atomically.
- Flatten rich paste to safe plain text, preserve all other characters, and insert unmarked text. Do not import images or executable HTML.
- Prototype user-triggered HTTPS clipboard writes and the manual-copy fallback. Check real LinkedIn paste paths using a user-owned composer without publishing.
- Approve the Unicode fixtures, token-recognition cases, schema, paragraph semantics, and editor extension design before expanding the UI.

### Exit evidence

Tamil composition commits intact; selection survives supported interactions; paste preserves Unicode and line breaks; history restores exact source; clipboard returns exact output. Record initial desktop and mobile device results and any editor-library limitations. A rendering-only prototype does not pass this milestone.

## 5. Milestone 2 — Complete deterministic formatting and inspection

### Work

- Implement core bold, italic, combined styles, selected-format clearing, and document-wide mark clearing.
- Implement sans/serif family changes and Advanced strike/underline. Require a selection for Advanced effects and show the specified selection prompt. Mark overlay effects experimental.
- Make mixed selections fully styled and fully styled selections toggle off. Preserve the selected range after actions. Collapsed bold/italic toggles affect subsequent typing; an Enter-created empty paragraph resets to plain.
- Implement token protection, all mapping combinations, overlay safety, unsupported-character counts, and explicit imported-style cleanup with preview and one undo transaction.
- Build exact selectable output with `white-space: pre-wrap` and `overflow-wrap: anywhere`; add approximate mobile/desktop widths and an ordinary-text reading view.
- Add Show changes metadata for substituted, skipped, and protected source characters without altering copied output.
- Show visible grapheme and exported UTF-16 counts, estimated threshold warnings, and clear Help definitions. Warnings never disable copy or truncate content.
- Implement hyphen, bullet, and numbered paragraph lists, toggle removal, type replacement, empty-line skipping, blank-line numbering resets, and explicit pasted-marker cleanup.
- Implement separate undoable spacing commands: exactly one blank line between nonempty paragraphs, at most one blank line when collapsing, and removal of only trailing ASCII spaces/tabs when trimming.
- Preserve user-supplied invisible/nonbreaking characters and punctuation. Flag invisible characters for inspection.
- Implement formatted copy, plain copy, and UTF-8 `.txt` download. Await clipboard success; show a selected read-only manual-copy field on failure. Empty copy shows “Write or paste a post first.”
- Build readiness checks with Pass, Notice, or Needs attention for length, tokens, unsupported styles, imported alphabets, overlays, invisible characters, placeholders, and excessive emphasis. Include optional list/emoji guidance and Review before copying.

### Exit evidence

Golden fixtures pass for every mapping, digit fallback, reverse mapping, segmentation fallback, and overlay combination. Tests prove toggle restoration, node-boundary token protection, unchanged Tamil/accents/emoji, exact newlines, sequential lists, spacing undo, and clipboard parity. Copy remains available with notices and provides post-copy instructions.

## 6. Milestone 3 — Complete daily-use features and durable local data

### Editing tools and presentation

- Deliver the light/dark desktop editor-and-preview layout and mobile Edit/Preview tabs. Provide a compact Bold/Italic/Emoji/More row, labelled bottom sheet, sticky toolbar, keyboard-aware Copy access, 44 px touch targets, focus rings, and 16 px minimum editor text.
- Add locally searched emoji categories, professional symbols, available skin tones, and device-local recent identifiers. Restore the captured caret and prevent emoji from inheriting overlays.
- Implement Clean Markdown using a parser with explicitly supported nodes. Preview paired bold/italic/strike and headings outside code; offer optional heading bold. Convert links to label plus visible URL in parentheses. Preserve malformed syntax, multiplication asterisks, code, and ambiguous nested constructs; list skipped content. Cancellation changes nothing; acceptance is one undo action.
- Add literal Find and Replace, case sensitivity, next match, and Replace all across marked runs within a paragraph. Never match across paragraph boundaries; replacements are unmarked and Replace all is one undo transaction.
- Add six original template structures with previews and explicit Replace/Append choices for nonempty drafts. Confirm replacement.
- Add up to 30 named plain-text snippets capped at 1,000 units. Insert without formatting as one undo action; request explicit append if the saved caret is invalid.
- Add first-use Paste/Format/Copy instructions and Try example. Returning users resume saved state only after hydration completes. New post creates a draft; confirmed reset remains undoable.

### Storage, backup, and recovery

- Implement create, rename, duplicate, open, and confirmed delete for up to 50 drafts. Reject draft 51 with an export-or-delete message.
- Autosave 800 ms after a committed edit; flush on draft switch and visibility changes where possible. Report Saving, Saved locally, or Could not save only according to transaction outcomes.
- Prevent hydration from overwriting a stored draft with empty initial state. Keep unsaved data in memory through failures and draft switches, and offer export.
- Keep the last three successfully saved revisions per draft; preview recovery and restore as a new draft subject to the draft cap.
- Coordinate tabs through BroadcastChannel and revision checks performed atomically with saving. Pause conflicting writes and offer a new copy or reload of saved state. Never silently overwrite.
- Define versioned JSON schemas for single-draft export and complete backup, including snippets and applicable local settings. Validate files up to 1 MB, document nodes, marks, source sizes, and collection caps before committing any state.
- Preview import effects and commit atomically. Invalid imports leave current data unchanged. Stage migrations on validated copies, preserve recoverable original payloads, and commit atomically.
- Handle corrupted drafts individually with raw backup export and deletion while leaving other drafts usable.
- Implement confirmed Delete all local data for drafts, recovery, snippets, preferences, and recent emojis. Explain local storage limitations and browser-data clearing.

### Exit evidence

Integration tests cover every cleanup cancellation and undo path, find across runs, snippet focus loss, invalid/oversized imports, reload durability, failed saves, hydration, draft limits, recovery, migration rollback, and two-tab conflicts. All feature workflows work with keyboard and expose concise live-region statuses.

## 7. Milestone 4 — Offline completion, launch validation, and handover

### Offline, privacy, and public content

- Cache the application shell and complete emoji resources with versioned caches. Test offline startup, editing, picker use, local draft access, and export after the first successful online load.
- Keep the previous usable cache until the replacement shell is ready. Offer an update prompt, save before reload, and handle save failures or tab conflicts without losing drafts.
- Add manifest metadata and optional installation. Never put draft data into cache requests or other network payloads.
- Apply a restrictive CSP for the static deployment; render user text safely and validate imports. Inspect network traffic to verify posts, selections, titles, clipboard data, and emoji searches remain local. Keep private data out of URLs, logs, and error reporting.
- Write original help for Unicode styling, Tamil preservation, mobile copy, recovery, Markdown cleanup, counts, accessibility, and experimental effects.
- Publish compatibility information with actual last-tested dates, surfaces, and limitations. Add an independent-tool footer disclaimer without LinkedIn branding.
- Add title, description, canonical URL, social preview, sitemap, and public help routes. Index public pages only. Share tool copies only the configured public site URL.

### Validation and launch evidence

- Test the latest two stable Chrome, Edge, Firefox, and Safari releases at launch, plus current Android Chrome and iOS Safari. Record exact versions.
- Run Playwright desktop workflows and denied/absent clipboard scenarios; use actual mobile devices for touch selection, keyboard layout, IME, and LinkedIn app paste.
- Check keyboard-only operation, focus return, Escape dismissal, contrast, 320 px layouts, 200% zoom, NVDA on Windows, and VoiceOver on iOS/macOS.
- Measure production compressed JS/CSS against 350 KB excluding lazy-loaded emoji data. Measure toolbar/preview response under 100 ms for a 3,000-unit draft on a representative mid-range device; document any approved budget exception.
- Validate output in a user-owned LinkedIn composer on desktop web, Android app, and iOS app. Check URLs/query strings, hashtags, Tamil mixed with English, accents, emoji sequences, lists, whitespace, glyphs, and trailing newlines.
- Establish current feed-post limits and counting behaviour through real paste tests, record results, and adjust advisory configuration. Do not publish test posts without separate authorization.
- Run moderated usability sessions with at least five representative users, including one mobile-first user. Target four of five completing paste/select/bold/emoji/copy within 60 seconds without coaching; all five must recover original words through undo or plain export.
- Record screenshots where appropriate, browser/OS versions, LinkedIn surfaces, font differences, timing and bundle results, privacy evidence, usability outcomes, and unresolved defects.

### Exit and handover

Block launch for text loss, draft overwrite, transformed protected URLs, duplicate overlays, incorrect copy, paste/import script execution, broken Tamil composition, inaccessible core controls, or failed offline workflows. Document minor native-font differences in experimental effects and preserve plain alternatives. The owner approves release and selects the deployment URL/display name; placeholders do not block development.

Deliver source, lockfile, build/deployment instructions, typed configuration, JSON schemas, mapping fixtures, dataset versions/licences, automated tests, browser/device evidence, privacy evidence, migration/conflict/update tests, usability checklist, known limitations, compatibility log, and maintenance guide.

## 8. Acceptance coverage and test ownership

| Requirement area | Primary validation | Milestone |
| --- | --- | --- |
| F01 safe editing/paste, source caps, IME, selection | Editor integration and real-device tests | 1 |
| F02–F04 styles, families, overlays, clearing/imported cleanup | Unicode goldens and transaction tests | 2 |
| Protected tokens, graphemes, counts, source/output parity | Unit fixtures plus browser copy tests | 2 |
| F06–F07 lists, spacing, history | Document-operation integration tests | 2 |
| F09 text copy/export and F10 preview/checks | Clipboard success/failure, exact-output fixtures | 2 |
| F05 emoji and F08 drafts | Local metadata, persistence, reload tests | 3 |
| JSON backup/import, revisions, concurrency, migration | Atomicity, validation, failure and two-tab tests | 3 |
| Markdown, templates, snippets, find/replace, reset | Preview/cancel, caret, exact undo tests | 3 |
| Accessibility and responsive layouts | Keyboard, zoom, screen-reader, device checks | 3–4 |
| Offline startup and safe shell updates | Production service-worker browser tests | 4 |
| Privacy/security, performance, LinkedIn compatibility | Network inspection, build metrics, real paste | 4 |
| First-use success and word recovery | Five-user moderated checklist | 4 |

Each milestone is complete only when its export behaviour and failure paths pass, not when its interface renders. Maintain a requirement checklist referencing the specification sections and the evidence files. Run focused checks during development and the complete release suite before deployment.

## 9. Risks and follow-up decisions

- **Selection and composition:** Resolve Tiptap/mobile/IME limitations in milestone 1 before building dependent tools.
- **Source and list semantics:** Freeze the newline/list model with golden round-trip examples to prevent blank-line or trailing-newline loss.
- **Unicode and token recognition:** Use explicit mapping tables and cross-run fixtures. Preserve uncertain characters and tokens with notices.
- **Persistence and updates:** Use atomic revision checks, recovery copies, and safe service-worker updates to avoid overwrite and reload loss.
- **Bundle size:** Measure early; choose editor extensions, segmentation fallback, parser, and lazy emoji loading accordingly.
- **Platform behaviour:** Native glyphs, screen-reader pronunciation, and LinkedIn limits require recorded evidence rather than promises.
- **Owner configuration:** Final brand name, domain, and release approval remain owner decisions. The developer owns dependency review, fixtures, browser testing, caches, and compatibility maintenance each release.

After launch, collect voluntary feedback with a warning against confidential drafts. Recheck paste compatibility after reported changes and keep plain copy available during investigation. Cloud sync, team presets, additional defensible script mappings, AI assistance, and scheduling require separate future scope; snippets and offline support are already part of release 1.
