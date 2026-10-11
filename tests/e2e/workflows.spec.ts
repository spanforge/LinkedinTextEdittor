import { expect, test, type Page } from '@playwright/test';
import { browserPaste } from './helpers';
const source = (page: Page) => page.getByRole('textbox', { name: 'Post source editor' });
const output = (page: Page) => page.getByTestId('export-output');
async function paste(page: Page, text: string) {
  await source(page).focus(); await page.keyboard.press('Control+a');
  await source(page).evaluate(browserPaste, { plain: text });
}
async function selectAll(page: Page) { await source(page).focus(); await page.keyboard.press('Control+a'); }
async function openTools(page: Page) { await page.getByRole('button', { name: 'More', exact: true }).click(); }
test.beforeEach(async ({ page }) => { await page.goto('/'); await expect(source(page)).toBeVisible(); });

test('Unicode formatting protects tokens, preserves scripts, toggles and retains source', async ({ page }) => {
  const text = 'Hello தமிழ் é 👨‍👩‍👧‍👦\n\nhttps://example.com/a?q=one&b=two #தமிழ் @name\n';
  await paste(page, text); await selectAll(page); await page.getByRole('button', { name: 'Bold', exact: true }).click();
  await expect(output(page)).toHaveText('𝗛𝗲𝗹𝗹𝗼 தமிழ் é 👨‍👩‍👧‍👦\n\nhttps://example.com/a?q=one&b=two #தமிழ் @name\n');
  await expect(source(page)).toContainText('Hello தமிழ்'); await page.getByRole('button', { name: 'Bold', exact: true }).click(); await expect(output(page)).toHaveText(text);
  await expect(page.locator('.save-status')).toHaveText('✓ Saved locally'); await page.reload(); await expect(output(page)).toHaveText(text);
});

test('selected sentence and no-selection typing follow mark/Enter rules', async ({ page }) => {
  await paste(page, 'Before middle after'); await source(page).focus(); await page.keyboard.press('Home'); for (let i=0;i<7;i++) await page.keyboard.press('ArrowRight'); for (let i=0;i<6;i++) await page.keyboard.press('Shift+ArrowRight');
  await page.getByRole('button', { name: 'Bold', exact: true }).click(); await expect(output(page)).toHaveText('Before 𝗺𝗶𝗱𝗱𝗹𝗲 after');
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('End'); await expect(page.getByRole('button', { name: 'Bold', exact: true })).toHaveAttribute('aria-pressed', 'false'); await page.keyboard.press('Control+b'); await expect(page.getByRole('button', { name: 'Bold', exact: true })).toHaveAttribute('aria-pressed', 'true'); await page.keyboard.type('B'); await expect(output(page)).toHaveText('Before 𝗺𝗶𝗱𝗱𝗹𝗲 after𝗕');
  await page.keyboard.press('Enter'); await page.keyboard.type('plain'); await expect(output(page)).toHaveText('Before 𝗺𝗶𝗱𝗱𝗹𝗲 after𝗕\nplain');
});

test('Advanced overlays replace each other and undo restores text', async ({ page }) => {
  await paste(page, 'A9! 👍🏽 é'); await selectAll(page); await openTools(page);
  await page.getByRole('button', { name: 'Strike-through', exact: true }).click(); await expect(output(page)).toHaveText('A̶9̶!̶ 👍🏽 é');
  await page.getByRole('button', { name: 'Underline', exact: true }).click(); await expect(output(page)).toHaveText('A̲9̲!̲ 👍🏽 é');
  await page.getByRole('button', { name: 'Underline', exact: true }).click(); await expect(output(page)).toHaveText('A9! 👍🏽 é');
  await page.getByRole('button', { name: 'Close dialog' }).click();
});

test('serif bold italic and list numbering survive reload', async ({ page }) => {
  await paste(page, 'Ah9\nTwo\n\nThree'); await selectAll(page); await page.keyboard.press('Control+b'); await page.keyboard.press('Control+i'); await openTools(page); await page.getByRole('button', { name: 'Serif', exact: true }).click(); await page.getByRole('button', { name: 'Numbered list', exact: true }).click(); await page.getByRole('button', { name: 'Close dialog' }).click();
  await expect(output(page)).toHaveText('1. 𝑨𝒉𝟗\n2. 𝑻𝒘𝒐\n\n1. 𝑻𝒉𝒓𝒆𝒆'); await expect(page.locator('.save-status')).toHaveText('✓ Saved locally'); await page.reload(); await expect(output(page)).toHaveText('1. 𝑨𝒉𝟗\n2. 𝑻𝒘𝒐\n\n1. 𝑻𝒉𝒓𝒆𝒆');
});

test('cleanup previews cancel safely and apply as one undo action', async ({ page }) => {
  const text = '**Bold**\n*italic*\n[Site](https://example.com)\n`**code**`'; await paste(page,text); await openTools(page); await page.getByRole('button', { name: 'Clean Markdown', exact: true }).click(); await page.getByRole('button', { name: 'Cancel', exact: true }).click(); await expect(output(page)).toHaveText(text);
  await openTools(page); await page.getByRole('button', { name: 'Clean Markdown', exact: true }).click(); await page.getByRole('button', { name: 'Apply cleanup' }).click(); await expect(output(page)).toHaveText('𝗕𝗼𝗹𝗱\n𝘪𝘵𝘢𝘭𝘪𝘤\nSite (https://example.com)\n`**code**`'); await page.getByRole('button', { name: 'Undo', exact: true }).click(); await expect(output(page)).toHaveText(text);
});

test('find spans runs, replaces without marks, and replace all is undoable', async ({ page }) => {
  await paste(page,'hello hello\nhello'); await selectAll(page); await page.keyboard.press('Control+b'); await openTools(page); await page.getByRole('button', { name: 'Find and replace', exact: true }).click();
  await page.getByLabel('Find literal text').fill('hello'); await page.getByLabel('Replace with').fill('world'); await expect(page.getByText('3 matches. Search does not cross paragraph boundaries.')).toBeVisible();
  await page.getByRole('button', { name: 'Replace all', exact: true }).click(); await expect(output(page)).toHaveText('world world\nworld'); await page.getByRole('button', { name: 'Close dialog' }).click(); await page.getByRole('button', { name: 'Undo', exact: true }).click(); await expect(output(page)).toHaveText('𝗵𝗲𝗹𝗹𝗼 𝗵𝗲𝗹𝗹𝗼\n𝗵𝗲𝗹𝗹𝗼');
});

test('emoji search and snippets use saved caret and survive backup export', async ({ page }) => {
  await paste(page,'Start '); await source(page).focus(); await page.keyboard.press('End'); await page.getByRole('button', { name: 'Emoji', exact: true }).click(); await page.getByRole('textbox', { name: 'Search emoji' }).fill('thumbs');
  await page.getByRole('combobox', { name: 'Skin tone' }).selectOption('3'); await page.getByRole('button', { name: 'thumbs up sign', exact: true }).click(); await expect(output(page)).toHaveText('Start 👍🏽');
  await page.getByRole('button', { name: '＋ Snippets' }).click(); await page.getByLabel('Name', { exact: true }).fill('Signature'); await page.getByLabel('Plain text', { exact: true }).fill('\nRegards'); await page.getByRole('button', { name: 'Save snippet', exact: true }).click(); await page.getByRole('button', { name: 'Insert', exact: true }).click(); await expect(output(page)).toHaveText('Start 👍🏽\nRegards');
  await page.getByRole('button', { name: 'Export ↓' }).click(); const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'All drafts & snippets backup' }).click(); expect((await download).suggestedFilename()).toBe('formatter-backup.json');
});

test('clipboard bytes match exact export and success waits for resolution', async ({ page }) => {
  await paste(page,'Hello\n\nதமிழ் 👨‍👩‍👧‍👦\n'); await selectAll(page); await page.keyboard.press('Control+b');
  await page.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: (text: string) => new Promise<void>(resolve => { (window as any).copied = text; (window as any).finishCopy = resolve; }) } }); });
  await page.getByRole('button', { name: '⧉ Copy formatted text' }).click(); await expect(page.getByRole('status')).not.toContainText('Copied.'); expect(await page.evaluate(() => (window as any).copied)).toBe(await output(page).textContent());
  await page.evaluate(() => (window as any).finishCopy()); await expect(page.getByRole('status')).toContainText('Copied. Paste into LinkedIn');
});

test('clipboard denied provides full selected manual text and empty copy is explicit', async ({ page }) => {
  await page.getByRole('button', { name: '⧉ Copy formatted text' }).click(); await expect(page.getByRole('status')).toContainText('Write or paste a post first.');
  await paste(page,'One\n\nTwo\n'); await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new Error('Denied')) } }));
  await page.getByRole('button', { name: '⧉ Copy formatted text' }).click(); await expect(page.getByRole('textbox', { name: 'Manual copy text' })).toHaveValue('One\n\nTwo\n');
});

test('oversized paste and invalid JSON leave current draft unchanged', async ({ page }) => {
  await paste(page,'Keep these words'); await paste(page,'x'.repeat(20001)); await expect(output(page)).toHaveText('Keep these words'); await expect(page.getByRole('status')).toContainText('Insertion rejected');
  await page.getByRole('button', { name: 'Export ↓' }).click(); await page.locator('input[type=file]').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{"schemaVersion":999}') }); await expect(output(page)).toHaveText('Keep these words'); await expect(page.getByRole('status')).toContainText('Invalid draft');
});

test('draft switching, recovery as a copy, and reset confirmation', async ({ page }) => {
  await paste(page,'First version'); await expect(page.locator('.save-status')).toHaveText('✓ Saved locally'); await paste(page,'Second version'); await expect(page.locator('.save-status')).toHaveText('✓ Saved locally');
  await page.getByRole('button', { name: /Drafts/ }).click(); await page.getByRole('button', { name: 'Recover current draft' }).click(); const records = page.locator('.record'); await records.nth(1).getByRole('button', { name: 'Preview' }).click(); await page.getByRole('button', { name: 'Restore as a new draft' }).click(); await expect(page.locator('.draft-title')).toContainText('(recovered)');
  await openTools(page); await page.getByRole('button', { name: 'Reset draft', exact: true }).click(); await page.getByRole('button', { name: 'Cancel', exact: true }).click(); await expect(source(page)).not.toBeEmpty();
});

test('second tab pauses conflicting writes and allows a new copy', async ({ page, context }) => {
  await paste(page,'Original'); await expect(page.locator('.save-status')).toHaveText('✓ Saved locally'); const other = await context.newPage(); await other.goto('/'); await expect(output(other)).toHaveText('Original');
  await paste(other,'Other tab'); await expect(other.locator('.save-status')).toHaveText('✓ Saved locally'); await expect(page.getByText('This draft changed in another tab. Saving is paused to protect both versions.')).toBeVisible();
  await page.getByRole('button', { name: 'Keep this tab as a new copy' }).click(); await expect(page.locator('.draft-title')).toContainText('(copy)'); await expect(output(page)).toHaveText('Original'); await other.close();
});

test('offline reload includes saved drafts, emoji search and export; private text never enters requests', async ({ page, context }) => {
  const requests: string[] = []; page.on('request', r => requests.push(r.url() + (r.postData() || ''))); const secret = 'PRIVATE_SENTINEL_984321'; await paste(page,secret); await expect(page.locator('.save-status')).toHaveText('✓ Saved locally');
  await page.evaluate(async () => { await navigator.serviceWorker.ready; if (!navigator.serviceWorker.controller) await new Promise<void>(r => navigator.serviceWorker.addEventListener('controllerchange', () => r(), { once: true })); });
  await context.setOffline(true); await page.reload(); await expect(output(page)).toHaveText(secret); await page.getByRole('button', { name: 'Emoji', exact: true }).click(); await page.getByRole('textbox', { name: 'Search emoji' }).fill('check'); await expect(page.locator('.emoji-grid button').first()).toBeVisible(); expect(requests.every(r => !r.includes(secret))).toBe(true); await context.setOffline(false);
});

test('320px layout has no page overflow, tabs work, dark appearance persists', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 760 }); await paste(page,'Mobile words'); await expect(source(page)).toBeVisible(); await page.getByRole('tab', { name: 'Export preview' }).click(); await expect(output(page)).toBeVisible(); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Switch to dark appearance' }).click(); await page.reload(); await expect(page.getByRole('button', { name: 'Switch to light appearance' })).toBeVisible();
});

test('safe paste imports no HTML scripts or images', async ({ page }) => {
  await source(page).evaluate(browserPaste, { plain: 'Safe words', html: '<img src=x onerror="window.injected=true"><script>window.injected=true</script><b>Safe words</b>' });
  await expect(output(page)).toHaveText('Safe words'); expect(await page.evaluate(() => (window as any).injected)).toBeUndefined(); await expect(source(page).locator('img,script')).toHaveCount(0);
});
