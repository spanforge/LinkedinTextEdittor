import { chromium, firefox, webkit } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
const engines = { Chrome: [chromium,{channel:'chrome'}], Edge: [chromium,{channel:'msedge'}], Firefox: [firefox,{}], 'Playwright WebKit': [webkit,{}] };
const versions={};for(const [name,[engine,options]] of Object.entries(engines)){const browser=await engine.launch(options);versions[name]=await browser.version();await browser.close();}
await writeFile('docs/release-evidence/browser-versions.json',JSON.stringify({testedDate:'2026-10-11',os:'Windows NT 10.0.26200.0',versions},null,2)+'\n');console.log(JSON.stringify(versions));
