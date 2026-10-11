import { chromium } from '@playwright/test';
const browser=await chromium.launch({channel:'chrome'});const page=await browser.newPage();const errors=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.goto('http://127.0.0.1:3001');let opened=false;try{await page.getByRole('textbox',{name:'Post source editor'}).waitFor({timeout:5000});opened=true;}catch{}
console.log(JSON.stringify({developmentEditorOpened:opened,errors}));await browser.close();if(!opened)process.exitCode=1;
