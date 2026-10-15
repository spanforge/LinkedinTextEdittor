import { expect, test } from '@playwright/test';
import { browserPaste } from './helpers';

test('cursor placement, retained selection, and toolbar stability', async ({ page }) => {
  await page.goto('/');
  const editor = page.getByRole('textbox', { name: 'Post source editor' });
  await editor.evaluate(browserPaste, { plain: 'First paragraph\nSecond paragraph' });
  const toolbar = await page.locator('.toolbar').boundingBox();
  const first = await editor.locator('p').first().boundingBox();
  const area = await page.locator('.editor-area').boundingBox();
  await page.mouse.click(area!.x + 3, first!.y + first!.height / 2);
  await expect(editor).toBeFocused();
  await page.keyboard.type('X');
  await expect(editor.locator('p').first()).toContainText('X');
  await editor.focus(); await page.keyboard.press('Control+a');
  await page.getByRole('button', { name: 'More', exact: true }).click();
  await expect(page.locator('.saved-selection').first()).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  expect((await page.locator('.toolbar').boundingBox())!.height).toBe(toolbar!.height);
});

test('preview navigates to source and feed collapse preserves full copy', async ({ page }) => {
  await page.goto('/');
  const text = 'Opening thought\nSecond paragraph\nThird paragraph\nFourth paragraph\nLast paragraph';
  const editor = page.getByRole('textbox', { name: 'Post source editor' });
  await editor.evaluate(browserPaste, { plain: text });
  await page.getByRole('button', { name: 'Edit paragraph 2, line 2', exact: true }).click();
  await expect(editor).toBeFocused(); await page.keyboard.type('EDIT ');
  await expect(editor.locator('p').nth(1)).toHaveText('EDIT Second paragraph');
  await page.getByLabel('Feed preview').check();
  await expect(page.locator('.feed-collapsed')).toBeVisible();
  await expect(page.getByTestId('export-output')).toHaveText(text.replace('Second', 'EDIT Second'));
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (value: string) => { (window as any).copied = value; } } }));
  await page.locator('.copy-actions .primary').click();
  expect(await page.evaluate(() => (window as any).copied)).toBe(text.replace('Second', 'EDIT Second'));
  await page.getByRole('button', { name: '… see more' }).click();
  await expect(page.locator('.feed-collapsed')).toHaveCount(0);
});

test('writing comfort and draft organisation survive reload', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Post source editor' }).evaluate(browserPaste, { plain: 'Saved thought' });
  await page.getByRole('button', { name: '☆ Favourite', exact: true }).click();
  await page.getByLabel('Post status', { exact: true }).selectOption('Ready');
  await page.getByRole('button', { name: 'Writing comfort', exact: true }).click();
  await page.getByLabel('Font size').selectOption('22');
  await page.getByLabel('Line spacing').selectOption('2');
  await page.getByLabel('Editor width').selectOption('wide');
  await page.reload();
  await expect(page.getByRole('button', { name: '★ Favourited' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Post status', { exact: true })).toHaveValue('Ready');
  await expect(page.locator('.ProseMirror')).toHaveCSS('font-size', '22px');
  await expect(page.locator('.ProseMirror')).toHaveCSS('line-height', '44px');
  await expect(page.locator('.app-shell')).toHaveClass(/width-wide/);
  await page.getByRole('button', { name: /Drafts/ }).click();
  await page.getByLabel('Filter drafts').selectOption('Favourites');
  await expect(page.locator('.draft-record')).toHaveCount(1);
  await page.getByLabel('Actions for Untitled post').click();
  await page.getByRole('button', { name: 'Duplicate', exact: true }).click();
  await expect(page.locator('.draft-title')).toContainText('(copy)');
  await expect(page.getByRole('textbox', { name: 'Post source editor' })).toHaveText('Saved thought');
});

test('expanded writing works on mobile and exits with Escape', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 }); await page.goto('/');
  await page.getByRole('button', { name: 'Expand writing mode' }).click();
  await expect(page.locator('.editor-card')).toBeVisible();
  await expect(page.locator('.preview-card')).toBeHidden();
  await expect(page.locator('.copy-actions .primary')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.locator('.app-shell')).not.toHaveClass(/focus-mode/);
});
