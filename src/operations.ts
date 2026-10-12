import MarkdownIt from 'markdown-it';
import type { Doc, Inline, Mark, Paragraph } from './model';
import { fromText, normalize, sourceText } from './model';
import { protectedRanges, reverse, segments } from './unicode';
const md = new MarkdownIt({ html: false, linkify: false, breaks: false });
export function sliceInline(nodes: Inline[], from: number, to = Infinity): Inline[] {
  const result: Inline[] = []; let pos = 0;
  for (const n of nodes) { const length = n.type === 'text' ? n.text.length : 1; const start = Math.max(0, from - pos), end = Math.min(length, to - pos); if (end > start) result.push(n.type === 'text' ? { ...n, text: n.text.slice(start, end) } : n); pos += length; }
  return result;
}
export function spacing(doc: Doc, command: 'paragraph' | 'collapse' | 'trim'): Doc {
  if (command === 'trim') return { ...doc, content: doc.content.map(p => {
    const lines: Inline[][] = [[]]; for (const n of p.content || []) { if (n.type === 'hardBreak') lines.push([]); else lines.at(-1)!.push(n); }
    const content: Inline[] = []; lines.forEach((line, i) => { if (i) content.push({ type: 'hardBreak' }); const text = line.map(n => n.type === 'text' ? n.text : '').join(''); content.push(...sliceInline(line, 0, text.replace(/[ \t]+$/, '').length)); });
    return { ...p, content };
  }) };
  const content: Paragraph[] = [];
  const nonempty = (p: Paragraph) => (p.content || []).some(n => n.type === 'text' && n.text.length);
  if (command === 'paragraph') {
    // Preserve leading/trailing blank paragraphs; set inter-paragraph spacing only.
    const first = doc.content.findIndex(nonempty); let last = doc.content.length - 1; while (last >= 0 && !nonempty(doc.content[last])) last--;
    if (first < 0) return doc;
    content.push(...doc.content.slice(0, first));
    const populated = doc.content.slice(first, last + 1).filter(nonempty);
    populated.forEach((p, i) => { if (i) content.push({ type: 'paragraph', content: [] }); content.push(p); });
    content.push(...doc.content.slice(last + 1));
  } else {
    for (const p of doc.content) if (nonempty(p) || !content.length || nonempty(content.at(-1)!)) content.push(p);
  }
  return { type: 'doc', content };
}
export function cleanLists(doc: Doc): Doc {
  return { ...doc, content: doc.content.map(p => {
    const text = sourceText({ type: 'doc', content: [p] }); const match = text.match(/^(?:([-•]) |(\d+)\. )/);
    if (!match) return p;
    return { ...p, attrs: { listType: match[2] ? 'number' : match[1] === '-' ? 'hyphen' : 'bullet' }, content: sliceInline(p.content || [], match[0].length) };
  }) };
}
function pushText(content: Inline[], text: string, marks: Mark[] = []) {
  if (!text) return; const last = content.at(-1);
  if (last?.type === 'text' && JSON.stringify(last.marks || []) === JSON.stringify(marks)) last.text += text;
  else content.push({ type: 'text', text, ...(marks.length ? { marks } : {}) });
}
export function cleanImported(doc: Doc): { doc: Doc; skipped: number } {
  let skipped = 0;
  const content = doc.content.map(p => {
    const out: Inline[] = [];
    for (const n of p.content || []) {
      if (n.type === 'hardBreak') { out.push(n); continue; }
      for (const { segment } of segments(n.text)) {
        const chars = Array.from(segment); const converted = reverse.get(chars[0]); const base = converted?.char || chars[0];
        const overlay = chars.length === 2 && ['\u0332', '\u0335', '\u0336'].includes(chars[1]) && /^[\x21-\x7e]$/.test(base) ? chars[1] : undefined;
        if ((converted && chars.length === 1) || overlay) {
          const marks: Mark[] = [...(n.marks || []).filter(m => !['bold', 'italic', 'family', 'strike', 'underline'].includes(m.type)), ...(converted?.marks || [])];
          if (overlay) marks.push({ type: overlay === '\u0332' ? 'underline' : 'strike' });
          pushText(out, base, marks);
        } else {
          if (chars.some(c => /[\u0332\u0335\u0336]/.test(c) || (c.codePointAt(0)! >= 0x1d400 && c.codePointAt(0)! <= 0x1d7ff))) skipped++;
          pushText(out, segment, n.marks || []);
        }
      }
    }
    return { ...p, content: out };
  });
  return { doc: { type: 'doc', content }, skipped };
}
export function cleanMarkdown(doc: Doc, headingBold = false): { doc: Doc; skipped: number } {
  let skipped = 0, fenced = false;
  const content = doc.content.map(p => {
    const text = sourceText({ type: 'doc', content: [p] });
    if (/^\s*(```|~~~)/.test(text)) { fenced = !fenced; skipped++; return p; }
    if (fenced || /^ {4}|^\t/.test(text)) { skipped++; return p; }
    const heading = text.match(/^ {0,3}#{1,6} (.+)$/); const raw = heading ? heading[1] : text;
    // Parse inline syntax, but accept only explicitly supported, unambiguous constructs.
    const out: Inline[] = []; let i = 0;
    const inherited: Mark[] = heading && headingBold ? [{ type: 'bold' }] : [];
    const offset = heading ? text.length - raw.length : 0;
    const literal = (start: number, stop: number) => { for (const n of sliceInline(p.content || [], offset + start, offset + stop)) { if (n.type === 'hardBreak') out.push(n); else pushText(out, n.text, [...(n.marks || []).filter(m => !inherited.some(a => a.type === m.type)), ...inherited]); } };
    const protectedTokens = protectedRanges(raw);
    while (i < raw.length) {
      const protectedToken = protectedTokens.find(t => t.from <= i && t.to > i);
      if (protectedToken) { literal(i, protectedToken.to); i = protectedToken.to; continue; }
      if (raw[i] === '`') {
        const ticks = raw.slice(i).match(/^`+/)![0]; const end = raw.indexOf(ticks, i + ticks.length);
        const stop = end < 0 ? raw.length : end + ticks.length; literal(i, stop); skipped++; i = stop; continue;
      }
      if (raw[i] === '\\' && i + 1 < raw.length) { literal(i, i + 2); i += 2; continue; }
      if (raw[i] === '[') {
        const closing = raw.indexOf('](', i + 1);
        if (closing >= 0) {
          let end = closing + 2, balance = 1;
          for (; end < raw.length; end++) { if (raw[end] === '(') balance++; if (raw[end] === ')' && --balance === 0) break; }
          const candidate = raw.slice(i, end + 1); const tokens = md.parseInline(candidate, {})[0]?.children || [];
          if (balance === 0 && tokens.length === 3 && tokens[0].type === 'link_open' && tokens[1].type === 'text' && tokens[2].type === 'link_close') {
            pushText(out, `${tokens[1].content} (${raw.slice(closing + 2, end)})`, inherited); i = end + 1; continue;
          }
          if (balance === 0) { literal(i, end + 1); skipped++; i = end + 1; continue; }
        }
      }
      const delimiter = raw.startsWith('**', i) ? '**' : raw.startsWith('~~', i) ? '~~' : raw[i] === '*' ? '*' : '';
      if (delimiter) {
        const end = raw.indexOf(delimiter, i + delimiter.length);
        if (end > i + delimiter.length) {
          const candidate = raw.slice(i, end + delimiter.length); const inner = raw.slice(i + delimiter.length, end);
          const tokens = (md.parseInline(candidate, {})[0]?.children || []).filter(t => t.type !== 'text' || t.content !== '');
          const type = delimiter === '**' ? 'strong' : delimiter === '~~' ? 's' : 'em';
          const ambiguous = /[*~`]/.test(inner) || raw[i - 1] === '*' || raw[end + delimiter.length] === '*' || /https?:\/\//.test(inner);
          if (!ambiguous && tokens.length === 3 && tokens[0].type === `${type}_open` && tokens[1].type === 'text' && tokens[2].type === `${type}_close`) {
            pushText(out, tokens[1].content, [...inherited, { type: type === 'strong' ? 'bold' : type === 's' ? 'strike' : 'italic' }]); i = end + delimiter.length; continue;
          }
          if (ambiguous) { literal(i, end + delimiter.length); skipped++; i = end + delimiter.length; continue; }
        }
        skipped++;
      }
      literal(i, i + 1); i++;
    }
    return { ...p, content: out };
  });
  return { doc: { type: 'doc', content }, skipped };
}
export const templates = [
  { title: 'One idea', text: '[Your central idea]\n\nHere is what brought it into focus:\n[Observation]\n\nOne thing to try: [Action]\n\nWhat has your experience been?' },
  { title: 'Numbered steps', text: '[The outcome you want]\n\n1. [First step]\n2. [Second step]\n3. [Third step]\n\nStart with [Small action].' },
  { title: 'Comparison', text: '[Two approaches worth comparing]\n\nApproach A: [Benefit and trade-off]\n\nApproach B: [Benefit and trade-off]\n\nMy choice depends on [Context].' },
  { title: 'Short case study', text: '[The starting situation]\n\nThe challenge: [Problem]\nThe change: [Action]\nThe result: [Observed outcome]\n\nWhat I learned: [Lesson]' },
  { title: 'Announcement', text: '[Your news]\n\nWhat is new: [Details]\nWho it is for: [Audience]\nWhy it matters: [Reason]\n\nNext step: [Link or action]' },
  { title: 'Event invitation', text: '[Event name]\n\nJoin us to explore [Topic].\nWhen: [Date and time zone]\nWhere: [Venue or URL]\n\nYou will leave with [Takeaway].\nRegister: [URL]' },
];
export const example = fromText('Good ideas deserve clear words.\n\nA little emphasis goes a long way. Select a sentence and try Bold.\n\n✅ Keep your key terms readable\n✅ Give each idea room to breathe\n✅ Preview before you copy\n\nதமிழ், accents and emoji stay intact.\n\n#Communication');
