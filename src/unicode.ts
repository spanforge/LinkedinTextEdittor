import { graphemeSegments } from 'unicode-segmenter/grapheme';
import type { Doc, Mark } from './model';
import { config } from './config';
export const ranges = {
  sansBold: [0x1d5d4, 0x1d5ee, 0x1d7ec], sansItalic: [0x1d608, 0x1d622, 0], sansBoth: [0x1d63c, 0x1d656, 0x1d7ec],
  serifBold: [0x1d400, 0x1d41a, 0x1d7ce], serifItalic: [0x1d434, 0x1d44e, 0], serifBoth: [0x1d468, 0x1d482, 0x1d7ce],
} as const;
export type Style = keyof typeof ranges;
export function segments(text: string, fallback = false): { segment: string; index: number }[] {
  if (!fallback && typeof Intl.Segmenter === 'function') return Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text), x => ({ segment: x.segment, index: x.index }));
  return Array.from(graphemeSegments(text), x => ({ segment: x.segment, index: x.index }));
}
export function mapChar(c: string, style: Style): string {
  const [upper, lower, digits] = ranges[style]; const code = c.codePointAt(0)!;
  if (c.length !== 1) return c;
  if (style === 'serifItalic' && c === 'h') return '\u210e';
  if (code >= 65 && code <= 90) return String.fromCodePoint(upper + code - 65);
  if (code >= 97 && code <= 122) return String.fromCodePoint(lower + code - 97);
  if (code >= 48 && code <= 57 && digits) return String.fromCodePoint(digits + code - 48);
  return c;
}
export const reverse = new Map<string, { char: string; marks: Mark[] }>();
for (const style of Object.keys(ranges) as Style[]) {
  const family = style.startsWith('serif') ? 'serif' : 'sans'; const bold = style.endsWith('Bold') || style.endsWith('Both'); const italic = style.endsWith('Italic') || style.endsWith('Both');
  const marks: Mark[] = [...(bold ? [{ type: 'bold' } as Mark] : []), ...(italic ? [{ type: 'italic' } as Mark] : []), ...(family === 'serif' ? [{ type: 'family', attrs: { family } } as Mark] : [])];
  for (const c of 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789') { const mapped = mapChar(c, style); if (mapped !== c && !reverse.has(mapped)) reverse.set(mapped, { char: c, marks }); }
}
export type Range = { from: number; to: number; uncertain?: boolean };
export function protectedRanges(text: string): Range[] {
  const re = /(?<![\p{L}\p{N}_])(?:https?:\/\/[^\s<>]+|www\.[^\s<>]+|[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}|[#@][\p{L}\p{N}_][\p{L}\p{N}\p{M}_.-]*|(?:[\p{L}\p{N}-]+\.)+[a-zA-Z]{2,}(?:\/[^\s<>]*)?)/gu;
  const result: Range[] = [];
  for (const m of text.matchAll(re)) {
    let token = m[0].replace(/[.,;:!?]+$/u, '');
    while (token.endsWith(')') && (token.match(/\)/g)?.length || 0) > (token.match(/\(/g)?.length || 0)) token = token.slice(0, -1);
    const prefix = m.index > 0 ? text[m.index - 1] : '';
    if ((token.startsWith('#') || token.startsWith('@')) && /[\p{L}\p{N}_]/u.test(prefix)) continue;
    result.push({ from: m.index, to: m.index + token.length, uncertain: !/^(https?:\/\/|www\.|[#@])/.test(token) && !token.includes('@') });
  }
  return result;
}
export type Piece = { text: string; kind: 'ordinary' | 'substituted' | 'skipped' | 'protected' };
export type Serialized = { output: string; plain: string; pieces: Piece[]; graphemes: number; units: number; unsupported: number; protectedCount: number; uncertain: number; styledLetters: number; eligibleLetters: number; boldLines: number; overlays: number; imported: number };
export function serialize(doc: Doc): Serialized {
  const result: Serialized = { output: '', plain: '', pieces: [], graphemes: 0, units: 0, unsupported: 0, protectedCount: 0, uncertain: 0, styledLetters: 0, eligibleLetters: 0, boldLines: 0, overlays: 0, imported: 0 };
  let number = 0;
  const append = (text: string, kind: Piece['kind']) => { const last = result.pieces.at(-1); if (last?.kind === kind) last.text += text; else result.pieces.push({ text, kind }); result.output += text; };
  doc.content.forEach((p, pi) => {
    if (pi) { append('\n', 'ordinary'); result.plain += '\n'; }
    const nodes = p.content || []; const source = nodes.map(n => n.type === 'text' ? n.text : '\n').join('');
    const list = p.attrs?.listType; if (!source || list !== 'number') number = 0;
    const prefix = source ? list === 'number' ? `${++number}. ` : list === 'bullet' ? '• ' : list === 'hyphen' ? '- ' : '' : '';
    append(prefix, 'ordinary'); result.plain += prefix + source;
    const protectedTokens = protectedRanges(source); result.protectedCount += protectedTokens.length; result.uncertain += protectedTokens.filter(r => r.uncertain).length;
    const runs: { from: number; to: number; marks: Mark[] }[] = []; let pos = 0;
    for (const n of nodes) { const length = n.type === 'text' ? n.text.length : 1; runs.push({ from: pos, to: pos + length, marks: n.type === 'text' ? n.marks || [] : [] }); pos += length; }
    if (runs.some(r => r.marks.some(m => m.type === 'bold'))) result.boldLines++;
    let ri = 0, ti = 0;
    for (const { segment: g, index } of segments(source)) {
      while (ri < runs.length - 1 && index >= runs[ri].to) ri++;
      while (ti < protectedTokens.length && protectedTokens[ti].to <= index) ti++;
      const protectedToken = protectedTokens[ti] && protectedTokens[ti].from < index + g.length && protectedTokens[ti].to > index;
      const marks = runs[ri]?.marks || []; const has = (t: Mark['type']) => marks.some(m => m.type === t);
      const bold = has('bold'), italic = has('italic'), serif = marks.some(m => m.type === 'family' && m.attrs?.family === 'serif');
      const style: Style | undefined = bold || italic ? `${serif ? 'serif' : 'sans'}${bold && italic ? 'Both' : bold ? 'Bold' : 'Italic'}` as Style : undefined;
      const overlay = has('underline') ? '\u0332' : has('strike') ? '\u0336' : '';
      if (/^[A-Za-z]$/.test(g) && !protectedToken) { result.eligibleLetters++; if (style) result.styledLetters++; }
      if (Array.from(g).some(c => reverse.has(c) || /[\u0332\u0336]/.test(c) || (c.codePointAt(0)! >= 0x1d400 && c.codePointAt(0)! <= 0x1d7ff))) result.imported++;
      if (protectedToken) { append(g, 'protected'); continue; }
      let out = style ? mapChar(g, style) : g;
      if (overlay && /^[\x21-\x7e]$/.test(g)) { out += overlay; result.overlays++; }
      const supportedDigitFallback = !!style && /^\d$/.test(g) && !ranges[style][2] && !overlay;
      const skipped = !!(style || overlay) && out === g && !/^\s+$/u.test(g) && !supportedDigitFallback && !(style && !overlay && /^[\x21-\x2f\x3a-\x40\x5b-\x60\x7b-\x7e]$/.test(g));
      if (skipped) result.unsupported++;
      append(out, out !== g ? 'substituted' : skipped ? 'skipped' : 'ordinary');
    }
  });
  result.graphemes = segments(result.output).length; result.units = result.output.length; return result;
}
export type Check = { name: string; status: 'Pass' | 'Notice' | 'Needs attention'; detail: string };
export function checks(s: Serialized, guidance = true): Check[] {
  const items: Check[] = [
    { name: 'Post length', status: s.units > config.advisoryLimit ? 'Needs attention' : s.units >= config.advisoryLimit * config.cautionRatio ? 'Notice' : 'Pass', detail: `${s.units.toLocaleString()} UTF-16 units. ${config.advisoryLimit.toLocaleString()} is an estimated advisory limit, not guaranteed acceptance.` },
    { name: 'Protected tokens', status: s.uncertain ? 'Notice' : 'Pass', detail: `${s.protectedCount} URLs, emails, hashtags or @names kept ordinary.${s.uncertain ? ' Uncertain domain-like text was also protected.' : ''}` },
    { name: 'Unsupported styling', status: s.unsupported ? 'Notice' : 'Pass', detail: s.unsupported ? `${s.unsupported} styled graphemes left unchanged, including unsupported scripts or emoji.` : 'Supported characters use approved mappings.' },
    { name: 'Imported special characters', status: s.imported ? 'Notice' : 'Pass', detail: s.imported ? `${s.imported} imported styled graphemes preserved. Use Convert imported styles to inspect cleanup.` : 'No imported special alphabets detected.' },
    { name: 'Experimental effects', status: s.overlays ? 'Notice' : 'Pass', detail: s.overlays ? 'Combining marks can display differently across fonts and devices.' : 'No generated combining-mark effects.' },
    { name: 'Invisible characters', status: /[\u200b\u200c\u200d\u2060\ufeff\u00a0]/u.test(s.plain.replace(/\p{Extended_Pictographic}(?:\ufe0f|[\u{1f3fb}-\u{1f3ff}])?(?:\u200d\p{Extended_Pictographic}(?:\ufe0f|[\u{1f3fb}-\u{1f3ff}])?)*/gu, '')) ? 'Notice' : 'Pass', detail: 'User-supplied invisible and nonbreaking characters are preserved. Inspect them before copying.' },
    { name: 'Template placeholders', status: /\[[^\]\n]+\]|\{\{[^}]+\}\}/.test(s.plain) ? 'Needs attention' : 'Pass', detail: 'Review remaining bracketed placeholders; they may be intentional.' },
  ];
  if (guidance) {
    items.push({ name: 'Emphasis', status: s.boldLines > 1 || s.styledLetters / Math.max(1, s.eligibleLetters) > config.emphasisRatio ? 'Notice' : 'Pass', detail: 'Consider sparse emphasis. This is a product heuristic, not a LinkedIn rule.' });
    const markerTypes = new Set(s.plain.split('\n').map(l => l.match(/^\s*(-|•|\d+\.) /)?.[1]).filter(Boolean).map(x => /^\d/.test(x!) ? 'number' : x));
    items.push({ name: 'List consistency', status: markerTypes.size > 1 ? 'Notice' : 'Pass', detail: 'Consistent list markers can help scanning.' });
    const emoji = segments(s.plain).filter(g => /\p{Extended_Pictographic}/u.test(g.segment)).map(g => g.segment);
    items.push({ name: 'Repeated emoji', status: new Set(emoji).size < emoji.length ? 'Notice' : 'Pass', detail: 'Repeated emoji may be intentional. The app does not rewrite your post.' });
  }
  return items;
}
