import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { browserPaste } from './helpers';
const source = (p: Page) => p.getByRole('textbox', { name: 'Post source editor' });
const output = (p: Page) => p.getByTestId('export-output');
async function paste(p: Page, text: string) { await source(p).focus(); await p.keyboard.press('Control+a'); await source(p).evaluate(browserPaste,{plain:text}); }
test.beforeEach(async ({page})=> { await page.goto('/'); await expect(source(page)).toBeVisible(); });

test('collapsed toolbar toggles stay active for typing and Advanced needs selection', async ({page})=> {
  await source(page).focus(); await page.getByRole('button',{name:'Bold',exact:true}).click(); await expect(page.getByRole('button',{name:'Bold',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button',{name:'Bold',exact:true}).click(); await expect(page.getByRole('button',{name:'Bold',exact:true})).toHaveAttribute('aria-pressed','false');
  await page.keyboard.type('A'); await expect(output(page)).toHaveText('A'); await page.keyboard.press('Control+u'); await expect(page.getByRole('status')).toContainText('Select text to apply'); await page.keyboard.type('B'); await expect(output(page)).toHaveText('AB');
});

test('storage denied still allows editing, copy fallback and editable export', async ({page})=> {
  await page.addInitScript(()=> { Object.defineProperty(window,'indexedDB',{get(){throw new Error('Storage denied');}}); }); await page.reload(); await expect(source(page)).toBeVisible(); await paste(page,'Memory-only words தமிழ்');
  await expect(page.locator('.save-status')).toContainText('Could not save'); await expect(output(page)).toHaveText('Memory-only words தமிழ்'); await page.getByRole('button',{name:'Export ↓'}).click(); const pending = page.waitForEvent('download'); await page.getByRole('button',{name:'Editable draft JSON'}).click(); expect((await pending).suggestedFilename()).toContain('.json');
});

test('corrupted saved draft cannot overwrite or prevent valid drafts opening', async ({page})=> {
  await paste(page,'Valid surviving words'); await expect(page.locator('.save-status')).toHaveText('✓ Saved locally');
  await page.evaluate(()=>new Promise<void>((resolve,reject)=>{const req=indexedDB.open('sriram-linkedin-formatter',1);req.onsuccess=()=>{const tx=req.result.transaction('drafts','readwrite');tx.objectStore('drafts').put({id:'corrupted',schemaVersion:999,title:'Corrupted'});tx.oncomplete=()=>{req.result.close();resolve();};tx.onerror=()=>reject(tx.error);};}));
  await page.reload(); await expect(output(page)).toHaveText('Valid surviving words'); await page.getByRole('button',{name:/Drafts/}).click(); await expect(page.getByText('Unreadable corrupted draft: corrupted')).toBeVisible(); const pending = page.waitForEvent('download'); await page.getByRole('button',{name:'Export raw backup'}).click(); expect((await pending).suggestedFilename()).toBe('raw-draft-backup.json');
});

test('template replace confirms, spacing preserves intentional characters, reset undo restores', async ({page})=> {
  await paste(page,'A  \n\n\nB\u00a0\n'); await page.getByRole('button',{name:'More',exact:true}).click(); await page.getByRole('button',{name:'Trim trailing spaces',exact:true}).click(); await expect(output(page)).toHaveText('A\n\n\nB\u00a0\n'); await page.getByRole('button',{name:'Collapse blank lines',exact:true}).click(); await expect(output(page)).toHaveText('A\n\nB\u00a0\n'); await page.getByRole('button',{name:'Close dialog'}).click();
  await page.getByRole('button',{name:'▧ Templates'}).click(); await page.getByRole('button',{name:'Replace draft…'}).click(); await page.getByRole('button',{name:'Cancel',exact:true}).click(); await expect(output(page)).toHaveText('A\n\nB\u00a0\n');
  await page.getByRole('button',{name:'More',exact:true}).click(); await page.getByRole('button',{name:'Reset draft',exact:true}).click(); await page.getByRole('button',{name:'Confirm',exact:true}).click(); await expect(source(page)).toHaveText(''); await page.getByRole('button',{name:'Undo',exact:true}).click(); await expect(output(page)).toHaveText('A\n\nB\u00a0\n');
});

test('valid draft import is a new copy and cancel changes nothing', async ({page})=> {
  await paste(page,'Current words'); await expect(page.locator('.save-status')).toHaveText('✓ Saved locally');
  const d=await page.evaluate(()=>new Promise<any>(resolve=>{const req=indexedDB.open('sriram-linkedin-formatter',1);req.onsuccess=()=>{const read=req.result.transaction('drafts').objectStore('drafts').getAll();read.onsuccess=()=>{req.result.close();resolve(read.result[0]);};};})); d.title='Imported words'; d.editorDocument={type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Imported'}]}]};
  await page.locator('input[type=file]').setInputFiles({name:'draft.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(d))}); await page.getByRole('button',{name:'Cancel',exact:true}).click(); await expect(output(page)).toHaveText('Current words');
  await page.locator('input[type=file]').setInputFiles({name:'draft.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(d))}); await page.getByRole('button',{name:'Confirm import'}).click(); await expect(output(page)).toHaveText('Imported'); await expect(page.locator('.draft-title')).toContainText('Imported words'); await page.getByRole('button',{name:/Drafts/}).click(); await expect(page.locator('.record')).toHaveCount(2);
});

test('composition lifecycle keeps partial Tamil out of saved and generated state', async ({page})=> {
  await paste(page,'Committed '); await expect(page.locator('.save-status')).toHaveText('✓ Saved locally'); await source(page).focus(); await page.keyboard.press('End');
  await source(page).evaluate(el => { el.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' })); el.querySelector('p')!.appendChild(document.createTextNode('தமிழ்')); el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertCompositionText', data: 'தமிழ்', isComposing: true })); }); await expect(output(page)).toHaveText('Committed ');
  await source(page).evaluate(el => el.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: 'தமிழ்' }))); await expect(output(page)).toHaveText('Committed தமிழ்'); await expect(page.locator('.save-status')).toHaveText('✓ Saved locally'); await page.reload(); await expect(output(page)).toHaveText('Committed தமிழ்');
});

test('delete all local data removes prior words and snippets after confirmation', async ({page})=> {
  await paste(page,'Words to remove'); await expect(page.locator('.save-status')).toHaveText('✓ Saved locally'); await page.getByRole('button',{name:/Drafts/}).click(); await page.getByRole('button',{name:'Delete all local data',exact:true}).click(); await page.getByRole('button',{name:'Confirm',exact:true}).click(); await expect(source(page)).toHaveText('');
  await expect(page.locator('.save-status')).toHaveText('✓ Saved locally'); await page.reload(); await expect(source(page)).toHaveText(''); expect(await page.evaluate(()=>new Promise<string[]>(resolve=>{const req=indexedDB.open('sriram-linkedin-formatter',1);req.onsuccess=()=>{const read=req.result.transaction('drafts').objectStore('drafts').getAll();read.onsuccess=()=>{resolve(read.result.map(d=>JSON.stringify(d.editorDocument)));req.result.close();};};}))).not.toContain('Words to remove');
});

test('keyboard dialogs return focus and automated WCAG checks pass in both appearances', async ({page})=> {
  await source(page).focus(); await page.keyboard.press('Tab'); await page.getByRole('button',{name:'Help',exact:true}).focus(); await page.keyboard.press('Enter'); await expect(page.getByRole('dialog')).toBeVisible(); await page.keyboard.press('Escape'); await expect(page.getByRole('button',{name:'Help',exact:true})).toBeFocused();
  const light=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze(); expect(light.violations.map(v=>({id:v.id,description:v.description,nodes:v.nodes.map(n=>n.target)}))).toEqual([]);
  await page.getByRole('button',{name:'Switch to dark appearance'}).click(); const dark=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze(); expect(dark.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))).toEqual([]);
});

test('200% zoom equivalent layout has no horizontal scrolling', async ({page})=> {
  await page.setViewportSize({width:640,height:450}); await paste(page,'https://example.com/'+ 'longpath'.repeat(50)); expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true); await page.getByRole('tab',{name:'Export preview'}).click(); await expect(output(page)).toBeVisible(); expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('HTML-only clipboard is flattened in inert memory without image requests', async ({page})=> {
  const requests:string[]=[];page.on('request',r=>requests.push(r.url()));
  await source(page).evaluate(browserPaste,{html:'<p><b>Hello</b><img src="/PRIVATE_IMAGE_TOKEN"><script>window.injected=true</script></p><p>World<br>Again</p>'});
  await expect(output(page)).toHaveText('Hello\nWorld\nAgain');await expect(source(page).locator('img,script,strong')).toHaveCount(0);expect(requests.some(r=>r.includes('PRIVATE_IMAGE_TOKEN'))).toBe(false);
});

test('long drafts scroll within the editor so formatting and copy remain reachable', async ({page})=> {
  await paste(page,('A full paragraph to review before sharing.\n\n').repeat(100));
  expect(await page.locator('.editor-area').evaluate(el=>el.clientHeight<=520 && el.scrollHeight>el.clientHeight)).toBe(true);
  await page.getByRole('button',{name:'⧉ Copy formatted text'}).scrollIntoViewIfNeeded();await expect(page.getByRole('button',{name:'⧉ Copy formatted text'})).toBeVisible();
  await page.setViewportSize({width:320,height:760});expect(await page.locator('.editor-area').evaluate(el=>el.clientHeight<=420 && el.scrollHeight>el.clientHeight)).toBe(true);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
