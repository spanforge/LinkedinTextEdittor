# Human acceptance checks

Run these against the final production build. Record date, OS, device, browser/app version, result and evidence for each row. Automated browser checks and touch emulation do not complete these checks.

Keep valuable drafts backed up. Use a private sample in a LinkedIn composer and discard it afterward; publishing is not required.

| Check | Procedure | Pass condition | Evidence |
| --- | --- | --- | --- |
| Mouse selection | Drag across words and blank lines, select upward while scrolling, use Bold, then Undo. Click left/right padding on several lines. | Caret stays near the intended line; selection survives formatting; Undo restores original words. | Pending |
| Android and iPhone | With the software keyboard open, select text using handles, format it, insert an emoji, scroll, switch preview, and return to writing. Rotate the device. | No hidden selection handles, blocked controls, misplaced insertion or text loss. | Pending |
| Tamil/Hindi and mixed scripts | Use actual IME keyboards; compose partial words, commit, add English, accents and family/flag/skin-tone emoji. Save and reload. | Committed content is preserved exactly; partial composition is not saved or reformatted. | Pending |
| Screen readers | In NVDA and VoiceOver, enter the editor, format a selection, traverse the preview with arrows, activate a paragraph, open and close dialogs, save a named version and copy. | Controls have meaningful names; core work is possible; focus returns predictably; announcements are understandable. | Pending |
| Actual 200% browser zoom | Set browser zoom through its UI to 200%, then edit, open comfort controls and dialogs, use writing mode and copy. | No clipped controls or horizontal page scrolling; focused controls remain visible. | Pending |
| LinkedIn desktop/Android/iOS | Paste a sample containing styled letters, URLs with queries, hashtags, @names, emoji, repeated blank lines and a final newline. Test plain copy too. Do not publish. | Compare with exported text; record any glyph, spacing, counting and truncation differences. | Pending |
| Mid-range device timing | On a representative phone, format a selection in a 3,000-unit post and measure click/tap-to-preview latency. | Target under 100 ms; record samples and device rather than inferring from desktop. | Pending |
| Real-device offline | Load production online; save a draft and named version; reopen offline; edit, search emoji, copy and export. Reconnect and accept an update after saving. | Draft survives, cached assets work, safe update preserves text. | Pending |
| Five-user usability | Give five users (including one mobile-first user) paste/select/bold/emoji/copy and recover-original tasks without coaching. | At least four finish paste-to-copy in 60 seconds; all recover their original words. | Pending |

## Record template

- Tested on:
- Device / OS / browser or LinkedIn app version:
- Check:
- Sample:
- Result and observed differences:
- Screenshot / video / notes:
- Follow-up defect:

These rows remain pending until someone performs them. Headless WebKit is engine coverage and does not establish Safari or iPhone acceptance.
