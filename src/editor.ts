import { Extension, Mark as TiptapMark, type Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { closeHistory } from '@tiptap/pm/history';
import { Slice } from '@tiptap/pm/model';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { config } from './config';
import { fromText, normalize, sourceText, validateDoc, type Doc } from './model';

const navigationKey = new PluginKey<number | null>('navigationTarget');
const Family = TiptapMark.create({ name: 'family', addAttributes: () => ({ family: { default: 'sans' } }), parseHTML: () => [], renderHTML: ({ HTMLAttributes }) => ['span', { 'data-family': HTMLAttributes.family }, 0] });
export function extensions(notify: (text: string) => void) {
  return [StarterKit.configure({ blockquote: false, bulletList: false, orderedList: false, listItem: false, listKeymap: false, code: false, codeBlock: false, heading: false, horizontalRule: false, link: false, trailingNode: false, hardBreak: { keepMarks: false }, undoRedo: { depth: config.historyDepth } }), Family,
    Extension.create({ name: 'sourceContract', priority: 1000, addGlobalAttributes: () => [{ types: ['paragraph'], attributes: { listType: { default: null, renderHTML: attrs => attrs.listType ? { 'data-list': attrs.listType } : {} } } }],
      addKeyboardShortcuts() {
        const overlay = (type: 'strike' | 'underline') => { if (this.editor.state.selection.empty) { notify('Select text to apply this effect.'); return true; } return this.editor.chain().unsetMark(type === 'strike' ? 'underline' : 'strike').toggleMark(type).run(); };
        return { 'Mod-u': () => overlay('underline'), 'Mod-Shift-s': () => overlay('strike'), Enter: () => { const result = this.editor.commands.splitBlock(); if (result && this.editor.state.selection.$from.parent.content.size === 0) this.editor.view.dispatch(this.editor.state.tr.setStoredMarks([])); return result; } };
      },
      addProseMirrorPlugins() { return [new Plugin<number | null>({ key: navigationKey, state: { init: () => null, apply(tr, previous) { const next = tr.getMeta('navigationTarget'); return next !== undefined ? next : previous === null ? null : tr.mapping.map(previous); } }, props: { decorations(state) { const pos = navigationKey.getState(state); if (pos == null) return null; const node = state.doc.nodeAt(pos); return node?.type.name === 'paragraph' ? DecorationSet.create(state.doc, [Decoration.node(pos, pos + node.nodeSize, { class: 'navigation-target' })]) : null; } } }), new Plugin({
        filterTransaction(tr) { if (!tr.docChanged) return true; const length = sourceText(tr.doc.toJSON() as Doc).length; if (length > config.sourceLimit) { queueMicrotask(() => notify(`Insertion rejected: maximum ${config.sourceLimit.toLocaleString()} source UTF-16 units. Nothing was truncated.`)); return false; } return true; },
        props: { decorations(state) { const decorations: Decoration[] = []; if (!state.selection.empty) decorations.push(Decoration.inline(state.selection.from, state.selection.to, { class: 'saved-selection' })); let number = 0; state.doc.forEach((node, pos) => { if (!node.content.size || node.attrs.listType !== 'number') number = 0; else decorations.push(Decoration.node(pos, pos + node.nodeSize, { 'data-number': String(++number) })); }); return DecorationSet.create(state.doc, decorations); } }
      })]; }
    })];
}
export function replaceDocument(editor: Editor, doc: Doc, undoable = true) {
  validateDoc(doc); const node = editor.schema.nodeFromJSON(doc);
  const tr = closeHistory(editor.state.tr).replaceWith(0, editor.state.doc.content.size, node.content).setStoredMarks([]);
  if (!undoable) tr.setMeta('addToHistory', false);
  editor.view.dispatch(tr); editor.commands.focus();
}
export function insertPlain(editor: Editor, text: string, selection?: { from: number; to: number }) {
  text = normalize(text); const { state } = editor; const range = selection || state.selection;
  const removed = state.doc.textBetween(range.from, range.to, '\n', '\n').length;
  if (sourceText(editor.getJSON() as Doc).length - removed + text.length > config.sourceLimit) throw Error(`Insertion rejected: maximum ${config.sourceLimit.toLocaleString()} source UTF-16 units.`);
  const fragment = editor.schema.nodeFromJSON(fromText(text)).content;
  let tr = closeHistory(state.tr).setStoredMarks([]);
  if (!text.includes('\n')) tr = text ? tr.replaceWith(range.from, range.to, editor.schema.text(text)) : tr.delete(range.from, range.to);
  else tr = tr.replaceRange(range.from, range.to, new Slice(fragment, 1, 1));
  editor.view.dispatch(tr.setStoredMarks([])); editor.commands.focus(); return true;
}
export function listOperation(editor: Editor, type: 'hyphen' | 'bullet' | 'number') {
  const { from, to } = editor.state.selection; const paragraphs: { pos: number; attrs: Record<string, unknown> }[] = [];
  editor.state.doc.descendants((node, pos) => { if (node.type.name === 'paragraph' && node.content.size && (from === to ? from >= pos + 1 && from <= pos + node.nodeSize - 1 : pos < to && pos + node.nodeSize > from)) paragraphs.push({ pos, attrs: node.attrs }); });
  const remove = paragraphs.length > 0 && paragraphs.every(p => p.attrs.listType === type); let tr = closeHistory(editor.state.tr);
  for (const p of paragraphs) tr = tr.setNodeMarkup(p.pos, undefined, { ...p.attrs, listType: remove ? null : type });
  editor.view.dispatch(tr); editor.commands.focus();
}
export function findMatches(editor: Editor, query: string, sensitive: boolean) {
  if (!query || query.includes('\n') || query.includes('\r')) return [];
  const matches: { from: number; to: number }[] = [];
  editor.state.doc.descendants((node, pos) => { if (node.type.name !== 'paragraph') return; const text = node.textBetween(0, node.content.size, '', '\n');
    // Escaping produces a literal regex without changing UTF-16 offsets for case folding.
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); const re = new RegExp(escaped, sensitive ? 'gu' : 'giu');
    for (const m of text.matchAll(re)) matches.push({ from: pos + 1 + m.index, to: pos + 1 + m.index + m[0].length });
  }); return matches;
}
export function replaceMatches(editor: Editor, matches: { from: number; to: number }[], replacement: string) {
  if (/[\r\n]/.test(replacement)) throw Error('Replacement cannot contain paragraph breaks.');
  const total = sourceText(editor.getJSON() as Doc).length + matches.reduce((n, m) => n + replacement.length - (m.to - m.from), 0);
  if (total > config.sourceLimit) throw Error('Replacement exceeds the source size limit.');
  let tr = closeHistory(editor.state.tr); for (const m of [...matches].reverse()) tr = replacement ? tr.replaceWith(m.from, m.to, editor.schema.text(replacement)) : tr.delete(m.from, m.to);
  editor.view.dispatch(tr.setStoredMarks([])); editor.commands.focus();
}
