import { describe, expect, it } from 'vitest';
import goldens from '../fixtures/unicode-golden.json';
import { mapChar, reverse, segments, serialize, protectedRanges, checks, type Style } from '../../src/unicode';
import { fromText, type Doc, type Mark } from '../../src/model';
function styled(text: string, marks: Mark[]): Doc { const doc = fromText(text); for (const p of doc.content) for (const n of p.content || []) if (n.type === 'text') n.marks = marks; return doc; }
describe('Unicode export contract', () => {
  for (const [style, output] of Object.entries(goldens.styles)) it(`${style}: independent Unicode-name golden, 52 letters and 10 digits`, () => {
    expect(Array.from(goldens.source, c => mapChar(c, style as Style)).join('')).toBe(output);
    for (const c of Array.from(output)) if (!/[0-9]/.test(c)) expect(reverse.get(c)?.char).toBe(goldens.source[Array.from(output).indexOf(c)]);
  });
  it('uses serif italic h exception and does not map accents or complex clusters', () => {
    expect(mapChar('h', 'serifItalic')).toBe('ℎ'); expect(mapChar('é', 'sansBold')).toBe('é'); expect(mapChar('e\u0301', 'sansBold')).toBe('e\u0301');
  });
  it('preserves Tamil, Hindi, accents, flags, family and toned emoji exactly', () => {
    const text = 'தமிழ் हिन्दी é e\u0301 👨‍👩‍👧‍👦 🇮🇳 👍🏽';
    expect(serialize(styled(text, [{ type: 'bold' }, { type: 'strike' }])).output).toBe(text);
  });
  it('matches native/fallback grapheme segmentation for complex sequences', () => {
    const text = 'தமிழ் e\u0301 👨‍👩‍👧‍👦 🇮🇳 👍🏽\n';
    expect(segments(text, true)).toEqual(segments(text));
  });
  it('protects entire tokens across different marked runs and handles terminal punctuation', () => {
    const doc: Doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'https://exa', marks: [{ type: 'bold' }] }, { type: 'text', text: 'mple.com/a?q=one&b=two' }, { type: 'text', text: ' #தமிழ் @name mail@example.com www.example.com/path.', marks: [{ type: 'italic' }, { type: 'underline' }] }] }] };
    const s = serialize(doc); expect(s.output.startsWith('https://example.com/a?q=one&b=two')).toBe(true); expect(s.output).toContain('#தமிழ் @name mail@example.com www.example.com/path'); expect(s.protectedCount).toBe(5);
    const text = 'Go (https://example.com/foo(bar)).'; const r = protectedRanges(text)[0]; expect(text.slice(r.from, r.to)).toBe('https://example.com/foo(bar)');
  });
  it('overlays eligible source once, never emojis/combining clusters/whitespace', () => {
    const doc = styled('A9! é e\u0301 👍🏽\n', [{ type: 'bold' }, { type: 'strike' }]);
    expect(serialize(doc).output).toBe('𝗔\u0335𝟵\u0335!\u0335 é e\u0301 👍🏽\n'); expect(serialize(doc)).toEqual(serialize(doc));
    expect(serialize(styled('A\u0336', [{ type: 'strike' }])).output).toBe('A\u0336');
  });
  it('strikes imported styled letters without adding duplicate overlays', () => {
    for (const style of Object.keys(goldens.styles) as Style[]) {
      const text = Array.from('Hello9', c => mapChar(c, style)).join('');
      const expected = Array.from(text, c => c + '\u0335').join('');
      expect(serialize(styled(text, [{ type: 'strike' }])).output).toBe(expected);
      expect(serialize(styled(expected, [{ type: 'strike' }])).output).toBe(expected);
    }
  });
  it('preserves repeated blanks, source spacing and trailing newlines with one explicit list prefix', () => {
    const doc = fromText('one\ntwo\n\nthree\n\n'); for (const p of doc.content) p.attrs = { listType: 'number' };
    const s = serialize(doc); expect(s.output).toBe('1. one\n2. two\n\n1. three\n\n'); expect(s.plain).toBe(s.output);
  });
  it('counts visible vs UTF-16 units and never blocks long output', () => {
    const s = serialize(styled('A👍🏽', [{ type: 'bold' }])); expect(s.graphemes).toBe(2); expect(s.units).toBe(6);
    const long = serialize(fromText('x'.repeat(3001))); expect(checks(long)[0].status).toBe('Needs attention'); expect(long.output.length).toBe(3001);
  });
});
