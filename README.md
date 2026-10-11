# LinkedIn Text Formatter by Sriram Advisory

A private browser application for ordinary-source editing, Unicode formatting, exact-output preview, local drafts and manual LinkedIn copy/paste. No backend, accounts, AI service, analytics or watermark.

## Run locally

Use Node.js 24 LTS and npm. On Windows, use `npm.cmd` if PowerShell blocks `npm.ps1`.

```sh
npm ci
npm run build
npm run preview
```

Open **http://localhost:3000**. The production preview exercises offline caching and safe updates. `npm run dev` starts the development editor at **http://localhost:3001**, keeping it separate from the production service-worker cache. The development server intentionally does not install a service worker. Drafts belong to the browser origin, including its port: use the same address consistently, or export/import drafts to transfer between previews.

## Features

- Ordinary source text with bold, italic, combined sans/serif styles, experimental underline and strike, saved selection, keyboard shortcuts, undo and redo.
- Deterministic Unicode output with cross-run URL/email/hashtag/@name protection, unsupported-script preservation, grapheme and UTF-16 counts, Show changes, and ordinary reading view.
- Local emoji search, categories, skin tones, recent selections and professional symbols; lists, explicit spacing commands and safe plain paste.
- Previewed Markdown and imported-style cleanup, Find and Replace, six original templates, and 30 plain-text snippets.
- IndexedDB drafts, autosave statuses, JSON backup/import validation, three recovery revisions, atomic migration, two-tab conflict handling, and confirmed deletion/reset.
- Exact formatted/plain copy, manual clipboard fallback and UTF-8 downloads; light/dark appearance, mobile Edit/Preview tabs and readiness checks.
- Versioned offline shell, locally cached emoji data, installation manifest and save-before-update workflow.

## Check the implementation

```sh
npm test
npm run check
npm run build
npm run test:e2e
```

The browser suite uses installed Chrome and Edge plus Playwright Firefox and WebKit. Install those test engines with `npx playwright install firefox webkit`. Run only Chrome using `npm run test:e2e -- --project=chrome`. In this environment Firefox requires execution outside the process sandbox; this is a runner restriction, not an application permission requirement.

See [implementationplan.md](implementationplan.md), [handover guide](docs/HANDOVER.md), [launch checklist](docs/LAUNCH_CHECKLIST.md), [release evidence](docs/release-evidence/README.md), and [third-party notices](docs/THIRD_PARTY_NOTICES.md).

## Deploy

Set `VITE_PUBLIC_URL=https://your-domain.example` in `.env.local` before building. Serve `dist/` from an HTTPS static host with SPA fallback. The build generates public help pages, a sitemap when a domain is configured, and a versioned service worker. `_headers` and `_redirects` cover compatible static hosts; configure equivalent headers and fallback on other hosts. Product identity, advisory limits and caps live in `src/config.ts`.

The test version remains beta until real LinkedIn composer, mobile device, screen-reader and moderated usability launch gates pass. The 3,000-unit advisory is an estimate. No test posts are published automatically.
