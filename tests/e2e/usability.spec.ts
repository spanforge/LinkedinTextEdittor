import { expect, test } from '@playwright/test';
import { browserPaste } from './helpers';

test('preview version determines clipboard output', async ({ page }) => {
  await page.goto('/');
  const editor = page.getByRole('textbox', { name: 'Post source editor' });
  await editor.evaluate(browserPaste, { plain: 'Hello world' });
  await editor.focus(); await page.keyboard.press('Control+a');
  await page.getByRole('button', { name: 'Bold', exact: true }).click();
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text: string) => { (window as any).copied = text; } } }));
  await page.getByRole('button', { name: 'Plain text', exact: true }).click();
  await expect(page.getByTestId('export-output')).toHaveText('Hello world');
  await page.getByRole('button', { name: '⧉ Copy plain text', exact: true }).click();
  expect(await page.evaluate(() => (window as any).copied)).toBe('Hello world');
  await page.getByRole('button', { name: 'Formatted', exact: true }).click();
  await page.getByRole('button', { name: '⧉ Copy formatted text', exact: true }).click();
  expect(await page.evaluate(() => (window as any).copied)).toBe('𝗛𝗲𝗹𝗹𝗼 𝘄𝗼𝗿𝗹𝗱');
});

test('mobile tabs support keyboard and copy stays visible for long drafts', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 760 }); await page.goto('/');
  await page.getByRole('textbox', { name: 'Post source editor' }).evaluate(browserPaste, { plain: 'A thought worth sharing.\n'.repeat(50) });
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Write', exact: true }).focus(); await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Preview', exact: true })).toBeFocused();
  await expect(page.getByRole('tabpanel', { name: 'Preview' })).toBeVisible();
  const copy = page.getByRole('button', { name: 'Copy post', exact: true });
  await expect(copy).toBeInViewport();
  await page.keyboard.press('ArrowLeft'); await expect(page.getByRole('tabpanel', { name: 'Write' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'docs/release-evidence/mobile-updated.png', fullPage: true });
});

test('draft search finds content and actions stay available', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Post source editor' }).evaluate(browserPaste, { plain: 'A unique searchable thought' });
  await expect(page.locator('.save-status')).toContainText('Saved locally');
  await page.getByRole('button', { name: /Drafts/ }).click();
  await page.getByLabel('Search drafts').fill('searchable'); await expect(page.locator('.record')).toHaveCount(1);
  await page.getByLabel('Search drafts').fill('missing words'); await expect(page.locator('.record')).toHaveCount(0);
  await page.getByLabel('Search drafts').fill('');
  await page.getByLabel('Actions for Untitled post').click(); await expect(page.getByRole('button', { name: 'Duplicate', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.screenshot({ path: 'docs/release-evidence/desktop-updated.png', fullPage: true });
});
for (const width of [1280, 320]) {
  test(`clear draft confirms and Undo restores text and formatting at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 760 }); await page.goto('/');
    const editor = page.getByRole('textbox', { name: 'Post source editor' });
    const clear = page.locator('.editor-bottom').getByRole('button', { name: 'Clear draft', exact: true });
    await expect(clear).toBeDisabled();
    await editor.evaluate(browserPaste, { plain: 'Keep my words\nSecond line' });
    await editor.focus(); await page.keyboard.press('Control+a'); await page.keyboard.press('Control+b');
    const preview = page.getByTestId('export-output');
    const original = await preview.textContent();
    const title = await page.locator('.draft-title').textContent();
    await clear.click(); await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(editor).toHaveText('Keep my wordsSecond line');
    await clear.click(); await page.getByRole('dialog').getByRole('button', { name: 'Clear draft', exact: true }).click();
    await expect(editor).toHaveText(''); await expect(clear).toBeDisabled();
    await expect(page.locator('.draft-title')).toHaveText(title!);
    await expect(page.getByRole('status')).toContainText('Draft cleared.');
    await page.getByRole('status').getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(editor).toHaveText('Keep my wordsSecond line'); await expect(preview).toHaveText(original!);
    await expect(page.getByRole('status')).toContainText('Draft restored.');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await clear.click(); await page.getByRole('dialog').getByRole('button', { name: 'Clear draft', exact: true }).click();
    await editor.focus(); await page.keyboard.type('New words');
    await expect(page.getByRole('status').getByRole('button', { name: 'Undo', exact: true })).toHaveCount(0);
  });
}
for (const width of [1280, 768, 320]) {
  test(`expanded draft actions preserve readable content at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 }); await page.goto('/');
    await page.getByRole('textbox', { name: 'Post source editor' }).evaluate(browserPaste, { plain: 'A draft preview that should stay readable when Actions opens.' });
    await expect(page.locator('.save-status')).toContainText('Saved locally');
    await page.getByRole('button', { name: /Drafts/ }).click();
    const row = page.locator('.draft-record').first();
    await row.locator('.record-menu summary').click();
    await expect(row.getByRole('button', { name: 'Duplicate', exact: true })).toBeVisible();
    await expect(row.getByRole('button', { name: 'Delete', exact: true })).toBeVisible();
    const bounds = await row.locator(':scope > div').evaluate(el => ({ width: el.getBoundingClientRect().width, height: el.querySelector('strong')!.getBoundingClientRect().height, overflow: el.parentElement!.scrollWidth > el.parentElement!.clientWidth }));
    expect(bounds.width).toBeGreaterThan(200); expect(bounds.height).toBeLessThan(50); expect(bounds.overflow).toBe(false);
    await page.screenshot({ path: `docs/release-evidence/draft-actions-${width}.png`, fullPage: true });
    await row.locator('.record-menu summary').click();
    await expect(row.getByRole('button', { name: 'Duplicate', exact: true })).toBeHidden();
  });
}
async function storedDraftIds(page: import('@playwright/test').Page): Promise<string[]> {
  return page.evaluate(() => new Promise<string[]>((resolve, reject) => {
    const req = indexedDB.open('sriram-linkedin-formatter', 1);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const read = req.result.transaction('drafts').objectStore('drafts').getAllKeys();
      read.onsuccess = () => { resolve(read.result as string[]); req.result.close(); };
      read.onerror = () => reject(read.error);
    };
  }));
}

test('deleting empty drafts removes the selected draft and never recreates the last one', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New post', exact: true }).click();
  await expect.poll(() => storedDraftIds(page)).toHaveLength(1);
  const [first] = await storedDraftIds(page);
  await page.getByRole('button', { name: 'New post', exact: true }).click();
  await expect.poll(() => storedDraftIds(page)).toHaveLength(2);
  const second = (await storedDraftIds(page)).find(id => id !== first)!;
  await page.getByRole('button', { name: /Drafts/ }).click();
  const active = page.locator('.draft-record').filter({ has: page.getByText('Current', { exact: true }) });
  await active.locator('summary').click(); await active.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete draft', exact: true }).click();
  await expect.poll(() => storedDraftIds(page)).toEqual([first]);
  expect(await storedDraftIds(page)).not.toContain(second);
  await page.getByRole('button', { name: /Drafts/ }).click();
  await page.locator('.draft-record summary').click(); await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete draft', exact: true }).click();
  await expect.poll(() => storedDraftIds(page)).toEqual([]);
  await page.waitForTimeout(1200); // Exceed autosave debounce to detect recreated drafts.
  expect(await storedDraftIds(page)).toEqual([]);
  await page.reload(); await expect(page.getByRole('button', { name: /Drafts/ })).toBeDisabled();
});

test('delete all drafts works with empty drafts and remains empty after reload', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: 'New post', exact: true }).click();
  await expect.poll(() => storedDraftIds(page)).toHaveLength(1);
  await page.getByRole('button', { name: /Drafts/ }).click();
  await page.getByRole('button', { name: 'Delete all drafts', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete all drafts', exact: true }).click();
  await expect.poll(() => storedDraftIds(page)).toEqual([]);
  await expect(page.getByRole('status')).toContainText('All drafts deleted.');
  await page.waitForTimeout(1200);
  expect(await storedDraftIds(page)).toEqual([]);
  await page.reload(); await expect(page.getByRole('button', { name: /Drafts/ })).toBeDisabled();
});

test('mobile Write view offers plain copy without changing the preview version', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 760 }); await page.goto('/');
  const editor = page.getByRole('textbox', { name: 'Post source editor' });
  await editor.evaluate(browserPaste, { plain: 'Hello mixed text' });
  await editor.focus(); await page.keyboard.press('Control+a'); await page.keyboard.press('Control+b');
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text: string) => { (window as any).copied = text; } } }));
  await page.getByRole('button', { name: 'Copy plain text', exact: true }).click();
  expect(await page.evaluate(() => (window as any).copied)).toBe('Hello mixed text');
  await expect(page.getByRole('tab', { name: 'Write', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: 'Copy post', exact: true }).click();
  expect(await page.evaluate(() => (window as any).copied)).toBe(await page.getByTestId('export-output').textContent());
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('draft search can recover from no results', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: 'New post', exact: true }).click();
  await page.getByRole('button', { name: /Drafts/ }).click();
  await page.getByLabel('Search drafts').fill('nothing matches');
  await expect(page.getByText('No matching drafts. Your saved drafts are still here.')).toBeVisible();
  await page.getByRole('button', { name: 'Clear search', exact: true }).click();
  await expect(page.getByLabel('Search drafts')).toHaveValue(''); await expect(page.locator('.draft-record')).toHaveCount(1);
});

test('delete all drafts preserves saved text and appearance, and disables with zero drafts', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Switch to dark appearance' }).click();
  await page.getByRole('button', { name: /Saved text/ }).click();
  await page.getByLabel('Name', { exact: true }).fill('Signature'); await page.getByLabel('Plain text', { exact: true }).fill('Regards');
  await page.getByRole('button', { name: 'Save text', exact: true }).click(); await expect(page.getByText('Signature', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('button', { name: 'New post', exact: true }).click();
  await page.getByRole('button', { name: /Drafts/ }).click();
  await page.getByRole('button', { name: 'Delete all drafts', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete all drafts', exact: true }).click();
  await expect.poll(() => storedDraftIds(page)).toEqual([]);
  await page.reload(); await expect(page.getByRole('button', { name: /Drafts/ })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Switch to light appearance' })).toBeVisible();
  await page.getByRole('button', { name: /Saved text/ }).click(); await expect(page.getByText('Signature', { exact: true })).toBeVisible();
});

test('Drafts main menu enables only when a draft is available', async ({ page }) => {
  await page.goto('/');
  const menu = page.getByRole('button', { name: /Drafts/ });
  await expect(menu).toBeDisabled();
  await page.getByRole('button', { name: 'New post', exact: true }).click();
  await expect(menu).toBeEnabled(); await menu.click();
  await page.getByRole('button', { name: 'Delete all drafts', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete all drafts', exact: true }).click();
  await expect(menu).toBeDisabled();
});
