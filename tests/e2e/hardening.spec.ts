import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { browserPaste } from './helpers';

test.beforeEach(async ({ page }) => { await page.goto('/'); });

test('preview has one tab stop and keyboard navigation ignores an existing selection', async ({ page }) => {
  const editor = page.getByRole('textbox', { name: 'Post source editor' });
  await editor.evaluate(browserPaste, { plain: 'First line\n\nThird line\nFourth line' });
  await editor.focus(); await page.keyboard.press('Control+a');
  await expect(page.locator('.preview-paragraph[tabindex="0"]')).toHaveCount(1);
  await page.locator('.preview-paragraph').first().focus();
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown');
  await expect(page.locator('.preview-paragraph').nth(2)).toBeFocused();
  await expect(page.locator('.preview-paragraph').nth(2)).toHaveAccessibleDescription('Third line');
  await page.keyboard.press('Enter');
  await expect(editor).toBeFocused();
  await expect(editor.locator('p').nth(2)).toHaveClass(/navigation-target/);
  await page.keyboard.type('Edited ');
  await expect(editor.locator('p').nth(2)).toHaveText('Edited Third line');
});

test('reset filters restores hidden drafts', async ({ page }) => {
  await page.getByRole('textbox', { name: 'Post source editor' }).evaluate(browserPaste, { plain: 'Visible again' });
  await expect(page.locator('.save-status')).toContainText('Saved locally');
  await page.getByRole('button', { name: /Drafts/ }).click();
  await page.getByLabel('Filter drafts').selectOption('Ready');
  await page.getByLabel('Search drafts').fill('missing');
  await expect(page.locator('.draft-record')).toHaveCount(0);
  await page.getByRole('button', { name: 'Reset filters' }).click();
  await expect(page.locator('.draft-record')).toHaveCount(1);
  await expect(page.getByLabel('Filter drafts')).toHaveValue('All');
});

test('named versions survive editing and restore into a separate draft', async ({ page }) => {
  const editor = page.getByRole('textbox', { name: 'Post source editor' });
  await editor.evaluate(browserPaste, { plain: 'Keep this version' });
  await expect(page.locator('.save-status')).toContainText('Saved locally');
  await page.getByRole('button', { name: /Drafts/ }).click();
  await page.getByRole('button', { name: 'Recover current draft' }).click();
  await page.getByLabel('Version name').fill('Before rewrite');
  await page.getByRole('button', { name: 'Save named version' }).click();
  await expect(page.getByText('Before rewrite', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await editor.focus(); await page.keyboard.press('Control+a'); await page.keyboard.type('New words');
  await expect(page.locator('.save-status')).toContainText('Saved locally');
  await page.reload();
  await page.getByRole('button', { name: /Drafts/ }).click();
  await page.getByRole('button', { name: 'Recover current draft' }).click();
  await page.locator('.record').filter({ has: page.getByText('Before rewrite', { exact: true }) }).getByRole('button', { name: 'Preview' }).click();
  await expect(page.locator('.text-preview')).toHaveText('Keep this version');
  await page.getByRole('button', { name: 'Restore as a new draft' }).click();
  await expect(editor).toHaveText('Keep this version');
  await page.getByRole('button', { name: /Drafts/ }).click();
  await expect(page.locator('.draft-record')).toHaveCount(2);
});

test('backup date persists only for a full backup download', async ({ page }) => {
  await page.getByRole('textbox', { name: 'Post source editor' }).evaluate(browserPaste, { plain: 'Back me up' });
  await expect(page.locator('.backup-reminder')).toBeVisible();
  await expect(page.locator('.save-status')).toContainText('Saved locally');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download backup', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('formatter-backup.json');
  await expect(page.locator('.backup-reminder')).toHaveCount(0);
  await page.reload();
  await page.getByRole('button', { name: /Export/ }).click();
  await expect(page.getByRole('dialog')).toContainText('Last backup download started:');
});

test('writing mode persists, closes dialogs with Escape, and fits short screens', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 480 });
  await page.getByRole('button', { name: 'Expand writing mode' }).click();
  await page.reload();
  await expect(page.locator('.app-shell')).toHaveClass(/focus-mode/);
  await page.getByRole('button', { name: 'Help', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.app-shell')).toHaveClass(/focus-mode/);
  const controls = await page.locator('.writing-controls').boundingBox();
  expect(await page.locator('.toolbar').evaluate(el => parseFloat(getComputedStyle(el).top))).toBeCloseTo(controls!.height, 0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.locator('.app-shell')).not.toHaveClass(/focus-mode/);
});

test('new controls pass automated accessibility checks with content', async ({ page }) => {
  await page.getByRole('textbox', { name: 'Post source editor' }).evaluate(browserPaste, { plain: 'Hello world\n\nA second thought' });
  await page.getByRole('button', { name: 'Writing comfort', exact: true }).click();
  await page.getByLabel('Feed preview').check();
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(result.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) }))).toEqual([]);
});

test('desktop interaction timings are recorded without transmitting draft text', async ({ page }, testInfo) => {
  const external: string[] = [];
  page.on('request', request => { if (!new URL(request.url()).hostname.match(/^(127\.0\.0\.1|localhost)$/)) external.push(request.url()); });
  const editor = page.getByRole('textbox', { name: 'Post source editor' });
  await editor.evaluate(browserPaste, { plain: 'A thought to share with others. '.repeat(96) });
  const samples: number[] = [];
  for (let i = 0; i < 5; i++) {
    await editor.focus(); await page.keyboard.press('Control+a');
    const start = performance.now();
    await page.getByRole('button', { name: 'Bold', exact: true }).click();
    await expect(page.getByTestId('export-output')).toContainText(i % 2 === 0 ? '𝗔' : 'A');
    samples.push(performance.now() - start);
  }
  await testInfo.attach('desktop-timings.json', { body: JSON.stringify({ browser: testInfo.project.name, sourceUnits: 2976, toolbarToVerifiedPreviewMs: samples, scope: 'Headless desktop automation; includes Playwright overhead. Not a real-device latency measurement.' }, null, 2), contentType: 'application/json' });
  expect(external).toEqual([]);
});

test.describe('touch input emulation', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });
  test('taps retain the caret through formatting and emoji insertion', async ({ page }) => {
    const editor = page.getByRole('textbox', { name: 'Post source editor' });
    await editor.evaluate(browserPaste, { plain: 'Touch editing' });
    await editor.locator('p').tap();
    await page.keyboard.press('End');
    await page.getByRole('button', { name: 'Bold', exact: true }).tap();
    await page.keyboard.type('B');
    await expect(page.getByTestId('export-output')).toContainText('𝗕');
    await page.getByRole('button', { name: 'Emoji', exact: true }).tap();
    await page.getByRole('textbox', { name: 'Search emoji' }).fill('rocket');
    await page.locator('.emoji-grid button').first().tap();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(editor).toContainText('Touch editingB');
    await page.getByRole('tab', { name: 'Preview', exact: true }).tap();
    await page.locator('.preview-paragraph').first().tap();
    await expect(editor).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
});
