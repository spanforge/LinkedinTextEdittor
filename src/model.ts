import { config } from './config';
export type Mark = { type: 'bold' | 'italic' | 'underline' | 'strike' | 'family'; attrs?: { family: 'sans' | 'serif' } };
export type Inline = { type: 'text'; text: string; marks?: Mark[] } | { type: 'hardBreak' };
export type Paragraph = { type: 'paragraph'; attrs?: { listType?: 'hyphen' | 'bullet' | 'number' | null }; content?: Inline[] };
export type Doc = { type: 'doc'; content: Paragraph[] };
export type Preferences = { theme: 'light' | 'dark'; guidance: boolean; dismissedIntro: boolean; fontSize?: number; lineSpacing?: number; editorWidth?: 'comfortable' | 'wide' };
export type Draft = { schemaVersion: 1; id: string; title: string; createdAt: string; updatedAt: string; revision: number; editorDocument: Doc; preferences: Partial<Preferences>; favourite?: boolean; status?: 'Idea' | 'Writing' | 'Ready' };
export type Snippet = { id: string; title: string; text: string };
export type Backup = { schemaVersion: 1; kind: 'backup'; drafts: Draft[]; snippets: Snippet[]; preferences: Preferences; recent: string[] };
export const normalize = (text: string) => text.replace(/\r\n?/g, '\n');
export function fromText(text: string): Doc { return { type: 'doc', content: normalize(text).split('\n').map(line => ({ type: 'paragraph', content: line ? [{ type: 'text', text: line }] : [] })) }; }
export function sourceText(doc: Doc): string { return doc.content.map(p => (p.content || []).map(n => n.type === 'text' ? n.text : '\n').join('')).join('\n'); }
export function newDraft(doc = fromText(''), title = 'Untitled post'): Draft { const now = new Date().toISOString(); return { schemaVersion: 1, id: crypto.randomUUID(), title, createdAt: now, updatedAt: now, revision: 0, editorDocument: doc, preferences: {} }; }
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const exact = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).every(k => keys.includes(k));
export function validateDoc(value: unknown): asserts value is Doc {
  if (!object(value) || !exact(value, ['type', 'content']) || value.type !== 'doc' || !Array.isArray(value.content) || !value.content.length || value.content.length > config.sourceLimit + 1) throw Error('Invalid document structure.');
  let units = value.content.length - 1;
  for (const p of value.content) {
    if (!object(p) || !exact(p, ['type', 'attrs', 'content']) || p.type !== 'paragraph' || (p.content !== undefined && !Array.isArray(p.content))) throw Error('Invalid paragraph.');
    if (p.attrs !== undefined && (!object(p.attrs) || !exact(p.attrs, ['listType']) || ![undefined, null, 'hyphen', 'bullet', 'number'].includes(p.attrs.listType as string))) throw Error('Invalid list metadata.');
    for (const n of (p.content || []) as unknown[]) {
      if (!object(n)) throw Error('Invalid node.');
      if (n.type === 'hardBreak' && exact(n, ['type'])) { units++; continue; }
      if (n.type !== 'text' || !exact(n, ['type', 'text', 'marks']) || typeof n.text !== 'string' || !n.text.length || n.text.includes('\r') || n.text.includes('\n')) throw Error('Invalid text node.');
      units += n.text.length;
      if (n.marks !== undefined && !Array.isArray(n.marks)) throw Error('Invalid marks.');
      const seen = new Set<string>();
      for (const m of (n.marks || []) as unknown[]) {
        if (!object(m) || !exact(m, ['type', 'attrs']) || typeof m.type !== 'string' || !['bold', 'italic', 'underline', 'strike', 'family'].includes(m.type) || seen.has(m.type)) throw Error('Invalid or duplicate mark.');
        seen.add(m.type);
        if (m.type === 'family' ? (!object(m.attrs) || !exact(m.attrs, ['family']) || !['sans', 'serif'].includes(m.attrs.family as string)) : m.attrs !== undefined) throw Error('Invalid mark attributes.');
      }
      if (seen.has('underline') && seen.has('strike')) throw Error('Underline and strike cannot overlap.');
    }
  }
  if (units > config.sourceLimit) throw Error(`Drafts may contain at most ${config.sourceLimit.toLocaleString()} source UTF-16 units.`);
}
export function validateDraft(value: unknown): asserts value is Draft {
  if (!object(value) || !exact(value, ['schemaVersion', 'id', 'title', 'createdAt', 'updatedAt', 'revision', 'editorDocument', 'preferences', 'favourite', 'status']) || value.schemaVersion !== 1 || typeof value.id !== 'string' || !value.id || value.id.length > 100 || typeof value.title !== 'string' || !value.title.trim() || value.title.length > 200 || typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt)) || typeof value.updatedAt !== 'string' || !Number.isFinite(Date.parse(value.updatedAt)) || !Number.isSafeInteger(value.revision) || Number(value.revision) < 0 || !object(value.preferences)) throw Error('Invalid draft metadata or unsupported schema version.');
  if ((value.favourite !== undefined && typeof value.favourite !== 'boolean') || (value.status !== undefined && !['Idea', 'Writing', 'Ready'].includes(value.status as string))) throw Error('Invalid draft organisation.');
  validatePreferences(value.preferences, true); validateDoc(value.editorDocument);
}
export function validatePreferences(v: unknown, partial = false): asserts v is Preferences {
  if (!object(v) || !exact(v, ['theme', 'guidance', 'dismissedIntro', 'fontSize', 'lineSpacing', 'editorWidth']) || (!partial && ['theme', 'guidance', 'dismissedIntro'].some(k => !(k in v))) || (v.theme !== undefined && !['light', 'dark'].includes(v.theme as string)) || (v.guidance !== undefined && typeof v.guidance !== 'boolean') || (v.dismissedIntro !== undefined && typeof v.dismissedIntro !== 'boolean')) throw Error('Invalid preferences.');
  if ((v.fontSize !== undefined && (typeof v.fontSize !== 'number' || ![16, 18, 20, 22].includes(v.fontSize))) || (v.lineSpacing !== undefined && (typeof v.lineSpacing !== 'number' || ![1.5, 1.7, 2].includes(v.lineSpacing))) || (v.editorWidth !== undefined && !['comfortable', 'wide'].includes(v.editorWidth as string))) throw Error('Invalid writing preferences.');
}
export function validateSnippets(v: unknown): asserts v is Snippet[] {
  if (!Array.isArray(v) || v.length > config.snippetLimit) throw Error('Invalid snippet collection.');
  const ids = new Set<string>();
  for (const s of v) { if (!object(s) || !exact(s, ['id', 'title', 'text']) || typeof s.id !== 'string' || !s.id || ids.has(s.id) || typeof s.title !== 'string' || !s.title.trim() || s.title.length > 200 || typeof s.text !== 'string' || s.text.length > config.snippetUnits || s.text.includes('\r')) throw Error('Invalid snippet.'); ids.add(s.id); }
}
export function parseImport(text: string): Draft | Backup {
  if (new TextEncoder().encode(text).length > config.importBytes) throw Error('Import must be 1 MB or smaller.');
  const v: unknown = JSON.parse(text);
  if (object(v) && v.kind === 'backup') {
    if (!exact(v, ['schemaVersion', 'kind', 'drafts', 'snippets', 'preferences', 'recent']) || v.schemaVersion !== 1 || !Array.isArray(v.drafts) || v.drafts.length > config.draftLimit) throw Error('Invalid backup.');
    const ids = new Set<string>(); for (const d of v.drafts) { validateDraft(d); if (ids.has(d.id)) throw Error('Duplicate draft IDs.'); ids.add(d.id); }
    validateSnippets(v.snippets); validatePreferences(v.preferences);
    if (!Array.isArray(v.recent) || v.recent.length > 30 || v.recent.some(x => typeof x !== 'string' || x.length > 100)) throw Error('Invalid emoji history.');
    return v as unknown as Backup;
  }
  validateDraft(v); return v;
}
