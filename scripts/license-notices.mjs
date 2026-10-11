import { readFile, readdir, mkdir, writeFile, copyFile } from 'node:fs/promises';
const pkg=JSON.parse(await readFile('package.json','utf8'));const lock=JSON.parse(await readFile('package-lock.json','utf8'));await mkdir('docs/licenses',{recursive:true});
let lines=['# Third-party notices','', 'Runtime dependencies are pinned in package.json and package-lock.json. Emoji metadata is bundled locally. The application does not redistribute Unicode chart fonts.','', '| Package | Version | Licence |','| --- | --- | --- |'];
let notices='Third-party software included in LinkedIn Text Formatter\n\n';
const runtime = Object.entries(lock.packages).filter(([path,info])=>path && (!info.dev && !info.devOptional || path==='node_modules/emoji-datasource'));
for(const [directory] of runtime){
  const info=JSON.parse(await readFile(directory+'/package.json','utf8'));const name=info.name;
  lines.push(`| ${name} | ${info.version} | ${info.license || 'See package'} |`);
  const files=await readdir(directory);const licence=files.find(f=>/^licen[cs]e(?:\.|$)/i.test(f));
  if(licence){await copyFile(directory+'/'+licence,'docs/licenses/'+name.replaceAll('/','-').replace('@','')+'.txt');notices+=`${name} ${info.version}\n${await readFile(directory+'/'+licence,'utf8')}\n\n`;}
}
lines.push('', 'Unicode goldens: generated from Unicode 16.0.0 character names using Python unicodedata. Regenerate only after review; checked-in fixtures are the independent mapping oracle.', '', 'For transitive packages, consult each installed package licence and the dependency lockfile before distributing modified versions.');
await writeFile('docs/THIRD_PARTY_NOTICES.md',lines.join('\n')+'\n');console.log('Wrote runtime dependency licences and version notices.');
await writeFile('public/third-party-notices.txt',notices);
