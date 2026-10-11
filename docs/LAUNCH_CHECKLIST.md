# Launch checklist

Automated implementation checks support a local beta. Complete and record the human gates below before public release. Never publish a test post without separate owner authorization.

## Required evidence

- [ ] Record the final owner-approved name, domain, hosting headers and release approval.
- [ ] Test latest two stable Chrome, Edge, Firefox and Safari releases at release time; record exact versions. Playwright WebKit is engine coverage, not a substitute for actual Safari.
- [ ] Test real Android Chrome and iOS Safari, touch selection, toolbar taps, keyboard visibility, caret restoration and emoji insertion.
- [ ] Test actual Tamil IME composition, mixed English/Tamil, Hindi, accents, family/flag/toned emoji, save and reload. Synthetic composition tests do not replace real keyboards.
- [ ] Check NVDA on Windows and VoiceOver on iOS/macOS: core editing, controls, dialogs, focus return, save/copy announcements and ordinary reading view.
- [ ] Check true browser 200% zoom and minimum 320 px devices. Reduced viewport automation is supplementary.
- [ ] Test a user-owned LinkedIn composer on desktop web, Android app and iOS app without publishing. Verify glyphs, protected URLs/query strings, hashtags, @name plain text, whitespace, repeated blank lines and final newlines.
- [ ] Establish the current feed-post length limit and counting behaviour using real pastes. Record observed results and adjust `config.advisoryLimit`. Never advertise guaranteed acceptance based on the app counter.
- [ ] Measure toolbar and preview response within 100 ms for a 3,000-unit draft on a representative mid-range device. Desktop headless timings are supporting evidence only.
- [ ] Record production compressed JS/CSS under 350 KB excluding lazy-loaded emoji data, or obtain and document a budget exception.
- [ ] Inspect production network requests for privacy; confirm no text, selections, draft titles, clipboard data or emoji queries are transmitted.
- [ ] Exercise offline startup after an initial complete online load: edit, emoji search, saved draft access, copy and exports. Verify safe updates and failed-install recovery on a real device.
- [ ] Run five-user moderated usability sessions, including one mobile-first participant. Target 4/5 completing paste/select/bold/emoji/copy in 60 seconds without coaching; all 5 must recover original words through undo or plain export.
- [ ] Record known experimental font differences, screenshots, defects, test dates and supported surfaces in the compatibility log and Help.

## Block public release on

Text loss; silent draft overwrite; protected URL transformation; duplicate overlays; incorrect clipboard output; paste/import script execution; broken Tamil composition; inaccessible core controls; or failure of the documented offline workflow. Notices never disable Copy. Minor experimental-effect glyph differences may be documented if ordinary text remains usable.

## Usability session record

| Participant | Device/browser | Paste-to-copy time | Completed without coaching | Original words recovered | Notes |
| --- | --- | --- | --- | --- | --- |
| 1 | Pending | Pending | Pending | Pending | |
| 2 | Pending | Pending | Pending | Pending | |
| 3 | Pending | Pending | Pending | Pending | |
| 4 | Pending | Pending | Pending | Pending | |
| 5 (mobile-first) | Pending | Pending | Pending | Pending | |

## LinkedIn compatibility record

| Date | OS/browser/app version | LinkedIn surface | Tested sample | Observed counting/limit | Rendering/spacing notes |
| --- | --- | --- | --- | --- | --- |
| Pending | Pending | Desktop web | URLs, Unicode, whitespace | Not established | |
| Pending | Pending | Android app | URLs, Unicode, whitespace | Not established | |
| Pending | Pending | iOS app | URLs, Unicode, whitespace | Not established | |
