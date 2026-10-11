import { describe, expect, it } from 'vitest';
import { fromText, parseImport, newDraft, sourceText, validateDoc, type Doc } from '../../src/model';
import { cleanMarkdown, cleanImported, cleanLists, spacing } from '../../src/operations';
import { serialize } from '../../src/unicode';
describe('Explicit document operations and validation', () => {
  it('cleans supported Markdown, exposes links, preserves code and literal multiplication', () => {
    const result = cleanMarkdown(fromText('**Bold** *italic* ~~strike~~\n# Heading\n[Site](https://example.com/a(b))\n2 * 3 = 6\n`**code**`\n```\n**raw**\n```'));
    expect(sourceText(result.doc)).toBe('Bold italic strike\nHeading\nSite (https://example.com/a(b))\n2 * 3 = 6\n`**code**`\n```\n**raw**\n```'); expect(serialize(result.doc).output).toContain('𝗕𝗼𝗹𝗱'); expect(result.skipped).toBeGreaterThan(0);
  });
  it('preserves malformed, nested and unmatched constructs', () => {
    for (const text of ['**missing', '**outer *inner***', 'a * b', '`literal`', 'http://example.com/a*b', 'http://example.com/a*b*c?q=**literal**', '[**nested**](https://example.com)']) expect(sourceText(cleanMarkdown(fromText(text)).doc)).toBe(text);
  });
  it('reverses known pairs only, preserving meaningful arbitrary marks', () => {
    const doc = cleanImported(fromText('𝗔\u0336 ℎ é e\u0301 A\u0301\u0336'));
    expect(sourceText(doc.doc)).toBe('A h é e\u0301 A\u0301\u0336'); expect(doc.doc.content[0].content?.[0]).toMatchObject({ text: 'A', marks: [{ type: 'bold' }, { type: 'strike' }] });
  });
  it('cleans list prefixes only explicitly', () => { const doc = fromText('- One\n• Two\n3. Three'); expect(serialize(doc).output).toBe('- One\n• Two\n3. Three'); expect(serialize(cleanLists(doc)).output).toBe('- One\n• Two\n1. Three'); });
  it('spacing commands preserve marks and named whitespace semantics', () => {
    const doc = fromText('\nA  \n\n\nB\t\n\n'); (doc.content[1].content![0] as any).marks = [{ type: 'bold' }];
    expect(sourceText(spacing(doc, 'paragraph'))).toBe('\nA  \n\nB\t\n\n'); expect(sourceText(spacing(doc, 'collapse'))).toBe('\nA  \n\nB\t\n'); expect(sourceText(spacing(doc, 'trim'))).toBe('\nA\n\n\nB\n\n'); expect(serialize(spacing(doc, 'trim')).output).toContain('𝗔');
    expect(sourceText(spacing(fromText('A\u00a0 \nB\u200b'), 'trim'))).toBe('A\u00a0\nB\u200b');
  });
  it('validates imports before state changes and rejects unknown schemas/marks/nodes/caps', () => {
    const d = newDraft(fromText('Hello')); expect(parseImport(JSON.stringify(d))).toEqual(d);
    for (const change of [{ schemaVersion: 999 }, { editorDocument: { type: 'doc', content: [{ type: 'image' }] } }, { editorDocument: fromText('x'.repeat(20001)) }]) expect(() => parseImport(JSON.stringify({ ...d, ...change }))).toThrow();
    expect(() => parseImport('x'.repeat(1000001))).toThrow('1 MB');
    const invalid: Doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A', marks: [{ type: 'underline' }, { type: 'strike' }] }] }] }; expect(() => validateDoc(invalid)).toThrow('overlap');
    expect(() => parseImport(JSON.stringify({ ...d, preferences: { secret: true } }))).toThrow();
  });
});
