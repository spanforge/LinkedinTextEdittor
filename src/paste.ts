import { normalize } from './model';
export function clipboardSource(data: DataTransfer | null): string | null {
  if (!data) return null;
  if (Array.from(data.types).includes('text/plain')) return normalize(data.getData('text/plain'));
  const html = data.getData('text/html'); if (!html) return null;
  // Template contents are inert. Never attach this fragment to the live document.
  const template = document.createElement('template'); template.innerHTML = html;
  const blocks = new Set(['P','DIV','LI','H1','H2','H3','H4','H5','H6','BLOCKQUOTE','PRE','TR']);
  const ignore = new Set(['SCRIPT','STYLE','IMG','SVG','OBJECT','IFRAME','NOSCRIPT','LINK','META']);
  const parts: { text: string; generated: boolean }[] = [];
  const endLine = () => { if (parts.length && !parts.at(-1)!.text.endsWith('\n')) parts.push({ text: '\n', generated: true }); };
  function visit(node: Node) {
    if (node.nodeType === Node.TEXT_NODE) { if (node.textContent) parts.push({ text: node.textContent, generated: false }); return; }
    if (!(node instanceof Element) && !(node instanceof DocumentFragment)) return;
    if (node instanceof Element) {
      if (ignore.has(node.tagName)) return;
      if (node.tagName === 'BR') { parts.push({ text: '\n', generated: false }); return; }
      if (blocks.has(node.tagName)) endLine();
    }
    for (const child of node.childNodes) visit(child);
    if (node instanceof Element && blocks.has(node.tagName)) endLine();
  }
  visit(template.content); if (parts.at(-1)?.generated) parts.pop();
  return normalize(parts.map(p => p.text).join(''));
}
