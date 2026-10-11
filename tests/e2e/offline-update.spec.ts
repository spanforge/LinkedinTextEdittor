import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { browserPaste } from './helpers';

test('service-worker update waits for save, preserves drafts, and a failed install keeps the working shell', async ({page,context})=>{
  let generation=1, failAsset=false; const root=resolve('dist');
  const server=createServer(async(req,res)=>{
    try {
      const pathname=new URL(req.url||'/', 'http://localhost').pathname; const file=resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
      if(!file.startsWith(root+sep)){res.writeHead(403).end();return;}
      if(failAsset && pathname.endsWith('.js') && pathname!=='/sw.js'){res.writeHead(503).end();return;}
      let body=await readFile(file); if(pathname==='/sw.js') body=Buffer.from(body.toString().replace(/const CACHE='[^']+'/ ,`const CACHE='formatter-update-test-${generation}'`));
      const mime=pathname.endsWith('.js')?'application/javascript':pathname.endsWith('.css')?'text/css':pathname.endsWith('.json')?'application/json':pathname.endsWith('.svg')?'image/svg+xml':pathname.endsWith('.png')?'image/png':pathname.endsWith('.webmanifest')?'application/manifest+json':'text/html';
      res.writeHead(200,{'Content-Type':mime,'Cache-Control':'no-store'}).end(body);
    } catch {res.writeHead(404).end();}
  });
  await new Promise<void>(r=>server.listen(0,'127.0.0.1',r)); const address=server.address() as {port:number};
  try {
    await page.goto(`http://127.0.0.1:${address.port}`);const src=page.getByRole('textbox',{name:'Post source editor'}); await src.waitFor();
    await src.evaluate(browserPaste,{plain:'Before update'});
    await expect(page.locator('.save-status')).toHaveText('✓ Saved locally');await page.evaluate(async()=>{await navigator.serviceWorker.ready;if(!navigator.serviceWorker.controller)await new Promise<void>(r=>navigator.serviceWorker.addEventListener('controllerchange',()=>r(),{once:true}));});
    generation=2;await page.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();await r!.update();});await expect(page.getByRole('button',{name:'Save & update'})).toBeVisible();
    expect(await page.evaluate(async()=> (await caches.keys()).includes('formatter-update-test-1'))).toBe(true);
    await src.focus();await page.keyboard.press('End');await page.keyboard.type(' + unsaved');await page.getByRole('button',{name:'Save & update'}).click();await expect(page.getByTestId('export-output')).toHaveText('Before update + unsaved');
    await expect(page.getByRole('button',{name:'Save & update'})).toHaveCount(0);await expect(page.locator('.save-status')).toHaveText('✓ Saved locally');
    generation=3;failAsset=true;await page.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();await r!.update();const worker=r!.installing;if(worker)await new Promise<void>(resolve=>{const done=()=>{if(['redundant','installed'].includes(worker.state))resolve();};worker.addEventListener('statechange',done);done();});});
    expect(await page.evaluate(async()=> (await caches.keys()).includes('formatter-update-test-2'))).toBe(true);await context.setOffline(true);await page.reload();await expect(page.getByTestId('export-output')).toHaveText('Before update + unsaved');
  } finally { await context.setOffline(false);await new Promise<void>(r=>server.close(()=>r())); }
});
