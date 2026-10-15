# Editor hardening — 15 October 2026

## Changes

- Preview navigation has one tab stop with Up/Down/Home/End navigation. Enter/Space works even while editor text is selected. Preview lines expose their text as an accessible description and briefly highlight the source paragraph using editor decorations.
- Draft favourites/status controls are disabled during saves so a rapid second action is not silently dropped. Empty search results offer a full filter reset.
- Writing mode is saved as a preference. Sticky toolbar positioning measures the controls instead of assuming a fixed height. Escape dismisses a dialog before exiting writing mode.
- Recovery retains three recent saves, 12 checkpoints spaced five minutes apart, and 10 named versions. Named versions are captured atomically from the saved draft; restoring creates a separate draft. Existing revision records remain readable. Recovery history is local and excluded from JSON exports.
- A backup reminder appears when no full backup download is recorded or the last is over seven days old. Export shows the last download initiation time; this does not certify completion of an operating-system save dialog.
- Preview rendering and line mapping are memoized in `PostPreview.tsx`. Selection validation compares immutable editor document identity rather than serializing the whole document on each selection change. Layout and backup logic have dedicated hooks, and writing styles have their own stylesheet. JSON schemas and Help match the new preferences and recovery behaviour.

## Verification

- TypeScript and production build passed; compressed application JS/CSS is 257.1 KiB, below the 350 KB budget.
- All 29 unit/integration tests passed, including legacy imports, strict preference validation, checkpoint spacing/retention, named-version retention and deletion.
- The complete production suite covered 216 cases across Chrome, Edge, Firefox and WebKit. Its first run passed 213 cases. One Chrome recovery test timed out; two WebKit assertions ambiguously selected both the update status and action status. Status assertions now target the action status area. The affected cases and final accessibility/clipboard changes passed all 24 checks in the separate confirmation run; see the attached summaries for exact results.
- The localhost:3001 development hardening suite passed all eight checks.
- Production coverage includes offline reload and safe updates, conflicting tabs, denied storage/clipboard access, HTML paste isolation, composition lifecycle, Unicode output, mobile layout, touch emulation, recovery, backups, and automated WCAG checks. Firefox required execution outside this host's process sandbox.
- [Desktop performance samples](hardening-performance.json) measure formatting a 3,000-unit draft through the next preview animation frame. These are headless desktop measurements, not phone latency evidence.
- Run summaries: [full suite](hardening-full-run.json), [final confirmation](hardening-confirmation.json).

## Remaining human acceptance

Actual Android/iPhone selection and software keyboards, NVDA/VoiceOver, real Tamil/Hindi IMEs, browser UI zoom, current Safari, LinkedIn desktop/mobile pasting and counting, mid-range device timings, and five-user usability sessions remain unverified. Use [the manual procedures](../MANUAL_ACCEPTANCE.md) and record results in [the launch checklist](../LAUNCH_CHECKLIST.md). Automated engines and touch emulation do not establish those results.
