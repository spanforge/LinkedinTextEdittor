import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

// Run after building and starting the production preview on port 3002.
const browser = await chromium.launch({ channel: 'chrome' });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:3002');
  const editor = page.getByRole('textbox', { name: 'Post source editor' });
  await editor.evaluate(el => {
    const clipboardData = new DataTransfer();
    clipboardData.setData('text/plain', 'A post worth sharing. '.repeat(200).slice(0, 3000));
    el.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData }));
  });
  const samples = [];
  for (let i = 0; i < 10; i++) {
    await editor.focus(); await page.keyboard.press('Control+a');
    samples.push(await page.evaluate(() => new Promise(resolve => {
      const output = document.querySelector('[data-testid="export-output"]');
      const before = output.textContent;
      const start = performance.now();
      const observer = new MutationObserver(() => {
        if (output.textContent === before) return;
        observer.disconnect();
        requestAnimationFrame(() => resolve(performance.now() - start));
      });
      observer.observe(output, { childList: true, characterData: true, subtree: true });
      document.querySelector('button[title="Bold"]').click();
    })));
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const report = {
    recordedAt: new Date().toISOString(), browser: browser.version(), sourceUnits: 3000,
    toolbarToPreviewFrameMs: samples.map(n => Number(n.toFixed(2))),
    medianMs: Number(sorted[5].toFixed(2)), p95Ms: Number(sorted[9].toFixed(2)), errors,
    notes: ['Headless desktop Chrome production build. Measures formatting click to the animation frame after preview text changes.', 'Supporting desktop evidence only; real mid-range mobile timing and real-device selection remain unverified.'],
  };
  await writeFile('docs/release-evidence/hardening-performance.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
} finally { await browser.close(); }
