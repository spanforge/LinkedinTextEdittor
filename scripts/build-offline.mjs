import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { mkdir } from 'node:fs/promises';
import { loadEnv } from 'vite';
import { helpEntries } from '../src/content.ts';
const publicUrl = process.env.VITE_PUBLIC_URL || loadEnv('production', process.cwd(), 'VITE_').VITE_PUBLIC_URL;
const escape = s => s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
if (publicUrl) { const parsed = new URL(publicUrl); if (parsed.protocol !== 'https:' || parsed.search || parsed.hash || parsed.username || parsed.password || parsed.pathname !== '/') throw Error('VITE_PUBLIC_URL must be an HTTPS origin without credentials, path, query or fragment.'); }
let html = await readFile('dist/index.html', 'utf8');
if (publicUrl) { html = html.replace('</head>', `<link rel="canonical" href="${escape(publicUrl)}"/><meta property="og:url" content="${escape(publicUrl)}"/></head>`).replace('content="/social.png"', `content="${escape(publicUrl.replace(/\/$/,'')+'/social.png')}"`); await writeFile('dist/index.html',html); }
for (const entry of helpEntries) {
  const title = escape(entry.title+' · LinkedIn Text Formatter'); const url = publicUrl ? publicUrl.replace(/\/$/,'')+'/help/'+entry.slug : '';
  const page = html.replace(/<title>.*?<\/title>/,`<title>${title}</title>`).replace(/<meta name="description" content="[^"]*"\/>/,`<meta name="description" content="${escape(entry.text.slice(0,160))}"/>`).replace(/<link rel="canonical" href="[^"]*"\/>/,`<link rel="canonical" href="${escape(url)}"/>`).replace('<div id="root"></div>', `<div id="root"><main><h1>${escape(entry.title)}</h1><p>${escape(entry.text)}</p><a href="/">Open editor</a></main></div>`);
  await mkdir('dist/help/'+entry.slug,{recursive:true});await writeFile('dist/help/'+entry.slug+'/index.html',page);
}
async function walk(dir) { let results = []; for (const e of await readdir(dir, { withFileTypes: true })) { const path = `${dir}/${e.name}`; results.push(...e.isDirectory() ? await walk(path) : [path]); } return results; }
const files = (await walk('dist')).filter(f => !f.endsWith('/sw.js') && !f.endsWith('/sitemap.xml'));
const hashes = await Promise.all(files.map(async f => createHash('sha256').update(await readFile(f)).digest('hex')));
const version = createHash('sha256').update(hashes.join('')).digest('hex').slice(0, 12);
const urls = files.map(f => '/'+f.slice(5));
const worker = `const CACHE='formatter-${version}'; const SHELL=${JSON.stringify(urls)};
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL))));
self.addEventListener('message',event=>{if(event.data==='ACTIVATE_AFTER_SAVE')self.skipWaiting();});
self.addEventListener('activate',event=>event.waitUntil((async()=>{await self.clients.claim();for(const key of await caches.keys())if(key.startsWith('formatter-')&&key!==CACHE)await caches.delete(key);})()));
self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==self.location.origin)return;event.respondWith((async()=>{const cache=await caches.open(CACHE);const cached=await cache.match(event.request,{ignoreVary:true});if(cached)return cached;if(event.request.mode==='navigate')return cache.match('/index.html',{ignoreVary:true});return fetch(event.request);})());});`;
await writeFile('dist/sw.js', worker);
let compressed = 0; for (const f of files.filter(f => /\.(js|css)$/.test(f))) compressed += gzipSync(await readFile(f)).length;
if (publicUrl) { const base = publicUrl.replace(/\/$/, ''); await writeFile('dist/sitemap.xml', `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${['/', '/help/how-bold-works','/help/tamil','/help/mobile-copy','/help/recovery','/help/markdown','/help/compatibility','/help/privacy'].map(p=>`<url><loc>${base+p}</loc></url>`).join('')}</urlset>`); }
await writeFile('dist/robots.txt', publicUrl ? 'User-agent: *\nAllow: /\nSitemap: '+publicUrl.replace(/\/$/,'')+'/sitemap.xml\n' : 'User-agent: *\nDisallow: /\n');
console.log(`Offline shell ${version}: ${urls.length} files. JS/CSS gzip: ${(compressed/1024).toFixed(1)} KiB (budget 350 KB).`);
if (compressed > 350000) { console.error('Bundle budget exceeded.'); process.exitCode = 1; }
