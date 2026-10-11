# Local beta verification — 11 October 2026

## Automated results

| Check | Result |
| --- | --- |
| Unicode/document-operation/storage tests | 24 passed |
| TypeScript and production build | Passed |
| Full browser workflow suite | 104 passed: 26 scenarios × Chrome, Edge, Firefox, WebKit |
| Final layout/accessibility checks after bounding long-draft panels | 12 passed: 3 scenarios × 4 engines, including 4 new long-draft checks |
| Development editor smoke check on port 3001 | Opened without browser errors |
| Dependency audit at installation | 0 known vulnerabilities after updating parser/test runner |
| Production compressed JS/CSS | Approximately 250.9 KiB; below 350 KB budget, emoji JSON excluded |
| 3,000-unit toolbar-to-preview timing | See `qa-report.json`; latest desktop headless runs approximately 4–8 ms |
| User content in network requests | Sentinel-content and inert HTML-image tests passed in all four engines |
| Local production endpoint | HTTP 200 on localhost:3000 |

Exact browser versions and OS appear in `browser-versions.json`. WebKit here is a Playwright engine on Windows, not real Safari or iOS. These results cover the installed versions; they do not establish the latest-two-stable-version release matrix.

The workflow suite covers core/Advanced styles, serif combinations, protected tokens, unsupported scripts, source/clipboard parity, clipboard denial, editor selection and typing, lists, cleanup preview/cancel/undo, find/replace, templates, snippets, emoji search/tones, source-size rejection, JSON validation/import, local durability, corruption, memory fallback, recovery, reset/deletion, tab conflicts, offline startup, safe updates, failed cache installation, focus return, automated WCAG checks, small layouts and synthetic composition.

Firefox initially required execution outside the sandbox. Its synthetic ClipboardEvent constructor also discarded supplied clipboardData, so tests now explicitly attach isolated test data. The composition test simulates partial DOM/input events rather than a native insertText action that can complete its own composition. These are test-runner corrections; no application clipboard reads were added.

## Artifacts

- `desktop.png`: editor and exact-output preview.
- `mobile.png` and `mobile-preview.png`: 320 px layouts.
- `qa-report.json`: measured timings and browser-error check.
- `browser-versions.json`: exact automated test engines and OS.
- `../LAUNCH_CHECKLIST.md`: pending real-device, screen-reader, LinkedIn composer and five-user usability gates.

Playwright writes traces for failed runs and its interactive HTML report under ignored `test-results/` and `playwright-report/`. Run `npm run test:e2e` to regenerate the full current report; Firefox needs an unrestricted process launch in this execution environment.

## Release boundary

This is an implemented local beta, not public release approval. Real Tamil IME keyboards, touch-selection ergonomics, NVDA/VoiceOver, true 200% zoom, real Android/iOS/Safari surfaces, LinkedIn paste/length behaviour and representative mobile performance remain unverified. The 3,000-unit advisory stays labelled an estimate. No LinkedIn posts were published.
