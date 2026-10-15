import type { CSSProperties } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import type { Editor } from '@tiptap/core';
import { closeHistory } from '@tiptap/pm/history';
import { config } from '../config';
import { fromText, parseImport, sourceText, validateDoc, type Doc, type Draft, type Backup } from '../model';
import { extensions, findMatches, insertPlain, listOperation, replaceDocument, replaceMatches } from '../editor';
import { checks, serialize, segments } from '../unicode';
import { cleanImported, cleanLists, cleanMarkdown, example, spacing, templates } from '../operations';
import { copyText, download, exportJSON, loadEmoji, type EmojiEntry } from '../services';
import { setupOffline } from '../offline';
import { storage } from '../storage';
import { useWorkbench, type Workbench } from '../useWorkbench';
import { helpEntries } from '../content';
import { clipboardSource } from '../paste';
import { Dialog } from './Dialog';

type Confirm = { title: string; text: string; action: () => void | Promise<void>; destructive?: boolean; label?: string };
type Preview = { title: string; before: string; doc: Doc; note: string };
function previewText(text: string) {
  // Draw a real strike line instead of relying on font-specific positioning
  // of combining strokes. Keep every output character in DOM order.
  const graphemes = segments(text);
  const runs: { text: string; strike: boolean }[] = [];
  for (const { segment } of graphemes) {
    const strike = /[\u0335\u0336]/u.test(segment);
    const previous = runs.at(-1);
    if (previous?.strike === strike) previous.text += segment;
    else runs.push({ text: segment, strike });
  }
  return runs.map((run, index) => run.strike ? <span className="preview-strike" key={index}>{Array.from(run.text).map((char, i) => /[\u0335\u0336]/u.test(char) ? <span className="preview-stroke-character" key={i}>{char}</span> : char)}</span> : run.text);
}
export function App() {
  const w = useWorkbench();
  return w.ready ? <Workspace key={w.draft.id} w={w} /> : <main className="loading"><div className="brand-icon">T</div><h1>Opening your writing space</h1><p>Loading local drafts before the editor starts…</p></main>;
}
function Workspace({ w }: { w: Workbench }) {
  const work = useRef(w); work.current = w;
  const [canUndoClear, setCanUndoClear] = useState(false);
  const [modal, setModal] = useState<string | null>(null), [confirm, setConfirm] = useState<Confirm | null>(null), [cleanup, setCleanup] = useState<Preview | null>(null);
  const [manualCopy, setManualCopy] = useState<string | null>(null), [tab, setTab] = useState<'edit' | 'preview'>('edit');
  const [previewWidth, setPreviewWidth] = useState<'mobile' | 'desktop'>('desktop'), [reading, setReading] = useState(false), [showChanges, setShowChanges] = useState(false);
  const [toolbarTick, setToolbarTick] = useState(0), [busy, setBusy] = useState(false), [rename, setRename] = useState(w.draft.title);
  const [emoji, setEmoji] = useState<EmojiEntry[]>([]), [emojiSearch, setEmojiSearch] = useState(''), [category, setCategory] = useState('All'), [tone, setTone] = useState(0), [emojiLimit, setEmojiLimit] = useState(120);
  const [find, setFind] = useState(''), [replacement, setReplacement] = useState(''), [sensitive, setSensitive] = useState(false);
  const [mobile, setMobile] = useState(() => matchMedia('(max-width: 767px)').matches);
  const [draftSearch, setDraftSearch] = useState('');
  const [focusMode, setFocusMode] = useState(false), [comfort, setComfort] = useState(false);
  const [feed, setFeed] = useState(false), [feedExpanded, setFeedExpanded] = useState(false);
  const [draftFilter, setDraftFilter] = useState('All');
  useEffect(() => { const exit = (e: KeyboardEvent) => { if (e.key === 'Escape') setFocusMode(false); }; window.addEventListener('keydown', exit); return () => window.removeEventListener('keydown', exit); }, []);

  const [snippetName, setSnippetName] = useState(''), [snippetText, setSnippetText] = useState('');
  const [chosenTemplate, setChosenTemplate] = useState(0), [headingBold, setHeadingBold] = useState(false);
  const [revisions, setRevisions] = useState<Draft[]>([]), [restore, setRestore] = useState<Draft | null>(null), [imported, setImported] = useState<Draft | Backup | null>(null);
  const [update, setUpdate] = useState<ServiceWorker | null>(null), [online, setOnline] = useState(navigator.onLine);
  const [route, setRoute] = useState(location.pathname);
  const selection = useRef<{ from: number; to: number; doc: string; draftId: string } | null>(null);
  const caretTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const fileInput = useRef<HTMLInputElement>(null), manualField = useRef<HTMLTextAreaElement>(null);
  const notify = (text: string) => work.current.notify(text);
  const run = async (action: () => unknown | Promise<unknown>) => { if (busy) return; setBusy(true); try { await action(); } catch(e) { notify(e instanceof Error ? e.message : 'The action could not be completed.'); } finally { setBusy(false); } };
  const editor = useEditor({
    extensions: useMemo(() => extensions(notify), []), content: w.draft.editorDocument,
    enableInputRules: false, enablePasteRules: false,
    editorProps: {
      attributes: { 'aria-label': 'Post source editor', role: 'textbox', 'aria-multiline': 'true', spellcheck: 'true', 'data-placeholder': 'Paste your draft here, or start with a thought…' },
      handlePaste(view, event) { event.preventDefault(); try { const text = clipboardSource(event.clipboardData); const e = view === editorRef.current?.view ? editorRef.current : null; if (e && text !== null && text !== '') insertPlain(e, text); } catch(e) { notify((e as Error).message); } return true; },
      handleDrop(_view, event) { event.preventDefault(); notify('Paste plain text or use Import JSON. Dropped HTML and images are not imported.'); return true; },
      handleDOMEvents: {
        compositionstart: () => { work.current.composing.current = true; return false; },
        compositionend: () => { setTimeout(() => { work.current.composing.current = false; const e = editorRef.current; if (e) work.current.edit(e.getJSON() as Doc); }, 0); return false; },
      },
    },
    onUpdate({ editor: e }) { setCanUndoClear(false); if (!work.current.composing.current && !e.view.composing) work.current.edit(e.getJSON() as Doc); },
    onSelectionUpdate({ editor: e }) {
      const s = e.state.selection; selection.current = { from: s.from, to: s.to, doc: JSON.stringify(e.getJSON()), draftId: work.current.draft.id };
      clearTimeout(caretTimer.current); caretTimer.current = setTimeout(() => { void work.current.saveCaret({ from: s.from, to: s.to }); }, 500);
      setToolbarTick(t => t + 1);
    },
    onTransaction() { setToolbarTick(t => t + 1); },
  });
  const editorRef = useRef<Editor | null>(null); editorRef.current = editor;
  useEffect(() => {
    if (!editor) return;
    if (JSON.stringify(editor.getJSON()) !== JSON.stringify(w.draft.editorDocument)) editor.commands.setContent(w.draft.editorDocument, { emitUpdate: false });
  }, [w.loadVersion, editor]);
  useEffect(() => {
    if (!editor) return; const saved = w.resumeSelection;
    if (saved && Number.isInteger(saved.from) && Number.isInteger(saved.to) && saved.from >= 1 && saved.to >= saved.from && saved.to <= editor.state.doc.content.size) editor.commands.setTextSelection(saved);
    selection.current = { from: editor.state.selection.from, to: editor.state.selection.to, doc: JSON.stringify(editor.getJSON()), draftId: w.draft.id };
    return () => clearTimeout(caretTimer.current);
  }, [editor, w.draft.id]);
  useEffect(() => { setRename(w.draft.title); }, [w.draft.title]);
  useEffect(() => {
    const query = matchMedia('(max-width: 767px)');
    const resize = () => setMobile(query.matches); query.addEventListener('change', resize);
    const viewport = window.visualViewport;
    const moveActions = () => document.documentElement.style.setProperty('--keyboard-inset', `${viewport ? Math.max(0, innerHeight - viewport.height - viewport.offsetTop) : 0}px`);
    viewport?.addEventListener('resize', moveActions); viewport?.addEventListener('scroll', moveActions); moveActions();
    return () => { query.removeEventListener('change', resize); viewport?.removeEventListener('resize', moveActions); viewport?.removeEventListener('scroll', moveActions); document.documentElement.style.removeProperty('--keyboard-inset'); };
  }, []);
  useEffect(() => {
    void setupOffline(setUpdate).catch(() => notify('Offline shell could not be cached. Keep this tab open or load once online.'));
    const onOnline = () => setOnline(navigator.onLine); const onPop = () => setRoute(location.pathname);
    window.addEventListener('online', onOnline); window.addEventListener('offline', onOnline); window.addEventListener('popstate', onPop);
    return () => { window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOnline); window.removeEventListener('popstate', onPop); };
  }, []);
  useEffect(() => {
    if (config.publicUrl) { let link = document.querySelector<HTMLLinkElement>('link[rel="canonical"]'); if (!link) { link = document.createElement('link'); link.rel = 'canonical'; document.head.append(link); } link.href = config.publicUrl.replace(/\/$/, '') + route; }
    document.title = route.startsWith('/help/') ? `${helpEntries.find(h => route.endsWith(h.slug))?.title || 'Help'} · ${config.name}` : `${config.name} by ${config.owner}`;
  }, [route]);
  useEffect(() => { if (modal === 'emoji') void loadEmoji().then(setEmoji).catch((e: Error) => notify(e.message)); }, [modal]);
  useEffect(() => { if (manualCopy !== null) setTimeout(() => { manualField.current?.focus(); manualField.current?.select(); }, 0); }, [manualCopy]);
  const serialized = useMemo(() => serialize(w.draft.editorDocument), [w.draft.editorDocument]);
  const [readiness, setReadiness] = useState(() => checks(serialized, w.preferences.guidance));
  useEffect(() => { const timer = setTimeout(() => setReadiness(checks(serialized, w.preferences.guidance)), config.checksMs); return () => clearTimeout(timer); }, [serialized, w.preferences.guidance]);
  const attention = readiness.filter(c => c.status !== 'Pass');
  const issues = attention.filter(c => c.status === 'Needs attention');
  const reviewMessage = issues.some(c => c.name === 'Template placeholders') ? 'Your draft still contains placeholders. Review them before copying.' : issues.some(c => c.name === 'Post length') ? 'Your post exceeds the estimated length. Consider shortening it.' : serialized.unsupported ? 'Some selected characters will stay unchanged.' : attention.length ? `${attention.length} optional formatting tips available.` : serialized.output ? 'Ready to copy. Check the result after pasting into LinkedIn.' : 'Start writing to see your preview.';
  function switchTab(next: 'edit' | 'preview', focus = false) { setTab(next); if (focus) requestAnimationFrame(() => document.getElementById(`tab-${next}`)?.focus()); }
  function tabKey(event: React.KeyboardEvent) { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { event.preventDefault(); switchTab(event.key === 'Home' ? 'edit' : event.key === 'End' ? 'preview' : tab === 'edit' ? 'preview' : 'edit', true); } }
  const confirmLabel = confirm?.label || (confirm?.title.startsWith('Delete all') ? 'Delete all drafts' : confirm?.title.startsWith('Delete snippet') ? 'Delete saved text' : confirm?.title.startsWith('Delete') ? 'Delete draft' : confirm?.title.startsWith('Reset') ? 'Reset draft' : confirm?.title.startsWith('Replace') ? 'Replace draft' : confirm?.title.startsWith('Reload') ? 'Reload saved version' : 'Append text');
  const listedDrafts = w.drafts.some(d => d.id === w.draft.id) || (!w.draft.revision && !sourceText(w.draft.editorDocument) && w.draft.title === 'Untitled post') ? w.drafts : [w.draft, ...w.drafts];
  const filteredDrafts = listedDrafts.filter(d => `${d.id === w.draft.id ? w.draft.title : d.title} ${sourceText(d.id === w.draft.id ? w.draft.editorDocument : d.editorDocument)}`.toLowerCase().includes(draftSearch.toLowerCase()) && (draftFilter === 'All' || draftFilter === 'Favourites' && d.favourite || (d.status || 'Idea') === draftFilter)).sort((a,b) => Number(!!b.favourite) - Number(!!a.favourite));
  const matches = editor ? findMatches(editor, find, sensitive) : [];
  const categories = useMemo(() => ['All', 'Recent', ...new Set(emoji.map(e => e.category))], [emoji]);
  const filteredEmoji = useMemo(() => emoji.filter(e => (category === 'All' || category === 'Recent' && w.recent.includes(e.id) || category === e.category) && `${e.name} ${e.keywords}`.includes(emojiSearch.toLowerCase())).sort((a,b) => category === 'Recent' ? w.recent.indexOf(a.id) - w.recent.indexOf(b.id) : 0), [emoji, emojiSearch, category, w.recent]);
  void toolbarTick;

  function jumpToParagraph(index: number) {
    if (!editor || !window.getSelection()?.isCollapsed) return;
    let pos = 1; for (let i = 0; i < index; i++) pos += editor.state.doc.child(i).nodeSize;
    switchTab('edit'); requestAnimationFrame(() => { editor.chain().focus().setTextSelection(pos).scrollIntoView().run(); capture(); });
  }
  const previewLines: { text: string; paragraph: number; pieces: { text: string; kind: string }[] }[] = [];
  let outputLine = 0; const piecesByLine: { text: string; kind: string }[][] = [[]];
  for (const piece of serialized.pieces) piece.text.split('\n').forEach((text, index) => { if (index) piecesByLine[++outputLine] = []; piecesByLine[outputLine].push({ text, kind: piece.kind }); });
  const lines = (reading ? serialized.plain : serialized.output).split('\n'); let lineIndex = 0;
  w.draft.editorDocument.content.forEach((p, paragraph) => { const count = 1 + (p.content || []).filter(n => n.type === 'hardBreak').length; for (let i = 0; i < count; i++, lineIndex++) previewLines.push({ text: lines[lineIndex] || '', paragraph, pieces: piecesByLine[lineIndex] || [] }); });

  function go(path: string) { history.pushState({}, '', path); setRoute(path); setModal(null); }
  function jsonDownload(name: string, value: unknown) { if (!exportJSON(name, value, config.importBytes)) notify('Backup downloaded in full, but it exceeds the 1 MB import cap. Also export individual editable drafts for separate restores.'); }
  function capture() { if (!editor) return; const s = editor.state.selection; selection.current = { from: s.from, to: s.to, doc: JSON.stringify(editor.getJSON()), draftId: w.draft.id }; }
  function clearDraft() {
    if (!editor || busy || !sourceText(editor.getJSON() as Doc)) return;
    setConfirm({ title: 'Clear this draft?', label: 'Clear draft', text: 'Remove all text and formatting from this draft. You can undo this action.', destructive: true, action: () => {
      if (w.composing.current || editor.view.composing) throw Error('Finish composing text before clearing the draft.');
      replaceDocument(editor, fromText('')); editor.commands.unsetAllMarks(); capture();
      setCanUndoClear(true); notify('Draft cleared.');
    } });
  }
  function validSelection() { const s = selection.current; return editor && s && s.draftId === w.draft.id && s.doc === JSON.stringify(editor.getJSON()) && s.to <= editor.state.doc.content.size ? s : null; }
  function focusSaved() { const s = validSelection(); if (editor && s && (editor.state.selection.from !== s.from || editor.state.selection.to !== s.to)) editor.commands.setTextSelection({ from: s.from, to: s.to }); }
  function format(mark: 'bold' | 'italic' | 'strike' | 'underline') {
    if (!editor) return; if (w.composing.current) { notify('Finish composing text before formatting.'); return; }
    focusSaved(); const { from, to } = editor.state.selection;
    if ((mark === 'strike' || mark === 'underline') && from === to) { notify('Select text to apply this effect.'); return; }
    const chain = editor.chain().focus(); if (mark === 'underline') chain.unsetStrike(); if (mark === 'strike') chain.unsetUnderline(); chain.toggleMark(mark).run(); capture();
  }
  function family(value: 'sans' | 'serif') { if (!editor) return; focusSaved(); if (editor.state.selection.empty) { notify('Select text to apply this effect.'); return; } editor.chain().focus().setMark('family', { family: value }).run(); capture(); }
  function insert(text: string, after?: () => void) {
    if (!editor) return;
    const s = validSelection();
    if (!s) { setModal(null); setConfirm({ title: 'Append at the end?', text: 'The previous caret is no longer valid. Append this text to the end of the current draft?', action: () => { const end = editor.state.doc.content.size - 1; insertPlain(editor, text, { from: end, to: end }); after?.(); capture(); } }); return; }
    insertPlain(editor, text, s); after?.(); capture();
  }
  async function copy(plain = false, tool = false) {
    const text = tool ? config.publicUrl || location.origin : plain ? serialized.plain : serialized.output;
    if (!text.trim()) { notify('Write or paste a post first.'); return; }
    try { await copyText(text); notify(tool ? 'Tool link copied.' : 'Copied. Paste into LinkedIn and check the result.'); }
    catch { setManualCopy(text); notify('Automatic copy is unavailable. Select and copy the text manually.'); }
  }
  function previewCleanup(type: 'markdown' | 'imported' | 'lists') {
    if (!editor) return; const doc = editor.getJSON() as Doc;
    const result = type === 'markdown' ? cleanMarkdown(doc, headingBold) : type === 'imported' ? cleanImported(doc) : { doc: cleanLists(doc), skipped: 0 };
    validateDoc(result.doc); setModal(null); setCleanup({ title: type === 'markdown' ? 'Clean Markdown' : type === 'imported' ? 'Convert imported styles to editable text' : 'Clean pasted list markers', before: serialize(doc).output, doc: result.doc, note: `${result.skipped} unrecognised or ambiguous constructs preserved.${type === 'markdown' ? ' Links retain visible URLs; clickable anchor labels are unavailable in plain-text posts.' : ''}` });
  }
  function startTemplate(append: boolean) {
    if (!editor) return; const text = templates[chosenTemplate].text;
    if (append) { const end = editor.state.doc.content.size - 1; insertPlain(editor, `${serialized.plain ? '\n\n' : ''}${text}`, { from: end, to: end }); setModal(null); }
    else if (sourceText(w.draft.editorDocument)) { setModal(null); setConfirm({ title: 'Replace the current words?', text: 'The template replaces the current draft. You can undo this action.', action: () => replaceDocument(editor, fromText(text)) }); }
    else { replaceDocument(editor, fromText(text)); setModal(null); }
  }
  async function loadRevisions() { setRevisions(await storage.revisions(w.draft.id)); setModal('recovery'); }
  const button = (label: string, action: () => void, active = false, className = '') => <button type="button" title={label} aria-pressed={active} className={`tool ${active ? 'active' : ''} ${className}`} onMouseDown={e => e.preventDefault()} onClick={() => { focusSaved(); action(); }} disabled={busy}>{label}</button>;
  const advancedTools = <>
    <details className="tool-group"><summary>Font style</summary><div className="tool-section">{button('Sans serif', () => family('sans'), !editor?.isActive('family', { family: 'serif' }))}{button('Serif', () => family('serif'), !!editor?.isActive('family', { family: 'serif' }))}</div></details>
    <details className="tool-group"><summary>Experimental effects</summary><div className="tool-section">{button('Underline', () => format('underline'), !!editor?.isActive('underline'))}{button('Strike-through', () => format('strike'), !!editor?.isActive('strike'))}<p className="muted">Select text first. Combining marks vary across fonts and devices.</p></div></details>
    <details className="tool-group"><summary>Lists</summary><div className="tool-section">{button('Hyphen list', () => editor && listOperation(editor, 'hyphen'))}{button('Bullet list', () => editor && listOperation(editor, 'bullet'))}{button('Numbered list', () => editor && listOperation(editor, 'number'))}</div></details>
    <details className="tool-group"><summary>Spacing</summary><div className="tool-section">{button('Add paragraph spacing', () => editor && run(() => replaceDocument(editor, spacing(editor.getJSON() as Doc, 'paragraph'))))}{button('Collapse blank lines', () => editor && replaceDocument(editor, spacing(editor.getJSON() as Doc, 'collapse')))}{button('Trim trailing spaces', () => editor && replaceDocument(editor, spacing(editor.getJSON() as Doc, 'trim')))}</div></details>
    <details className="tool-group"><summary>Cleanup</summary><div className="tool-section"><label className="check-label"><input type="checkbox" checked={headingBold} onChange={e => setHeadingBold(e.target.checked)} /> Bold Markdown headings</label>{button('Clean Markdown', () => previewCleanup('markdown'))}{button('Convert imported styles', () => previewCleanup('imported'))}{button('Clean pasted lists', () => previewCleanup('lists'))}{button('Clear selected formatting', () => { editor?.chain().focus().unsetAllMarks().run(); capture(); })}{button('Clear all formatting', () => { if (!editor) return; const doc = editor.getJSON() as Doc; replaceDocument(editor, { ...doc, content: doc.content.map(p => ({ ...p, content: p.content?.map(n => n.type === 'text' ? { type: 'text', text: n.text } : n) })) }); })}</div></details>
    <details className="tool-group"><summary>Find & replace</summary><div className="tool-section">{button('Find and replace', () => { capture(); setModal('find'); })}</div></details>
  </>;

  return <div className={`app-shell ${focusMode ? 'focus-mode' : ''} width-${w.preferences.editorWidth || 'comfortable'}`} style={{ '--writing-size': `${w.preferences.fontSize || 18}px`, '--writing-leading': w.preferences.lineSpacing || 1.7 } as CSSProperties}>
    <header className="site-header"><a href="/" className="brand" onClick={e => { e.preventDefault(); go('/'); }}><span className="brand-icon" aria-hidden="true">T<span>≡</span></span><span><strong>{config.name}</strong><small>by {config.owner}</small></span></a>
      <nav aria-label="Main navigation"><span className="local-badge"><span /> {online ? 'Private & local' : 'Offline'}</span><button disabled={listedDrafts.length + w.corrupt.length === 0} onClick={() => { capture(); setModal('drafts'); }}>Drafts <span className="count-badge">{listedDrafts.length}</span></button><button onClick={() => setModal('help')}>Help</button><button className="icon-button" aria-label={`Switch to ${w.preferences.theme === 'light' ? 'dark' : 'light'} appearance`} onClick={() => void w.setPreference({ theme: w.preferences.theme === 'light' ? 'dark' : 'light' })}>{w.preferences.theme === 'light' ? '☾' : '☀'}</button></nav>
    </header>
    {route.startsWith('/help/') ? <main className="help-page"><button onClick={() => go('/')}>← Back to editor</button><span className="eyebrow">HELP & TRUST</span><h1>{helpEntries.find(h => route.endsWith(h.slug))?.title || 'Help'}</h1><p>{helpEntries.find(h => route.endsWith(h.slug))?.text || 'Choose a help topic below.'}</p><div className="help-links">{helpEntries.map(h => <a key={h.slug} href={`/help/${h.slug}`} onClick={e => { e.preventDefault(); go(`/help/${h.slug}`); }}>{h.title} →</a>)}</div></main> : <main>
    <section className={`intro ${w.preferences.dismissedIntro || serialized.plain ? 'compact' : ''}`}><div><h1>Write. Format. <span>Copy to LinkedIn.</span></h1>{!w.preferences.dismissedIntro && !serialized.plain && <p>Paste your draft, select a few words to emphasise, then copy your post.</p>}</div><button className="new-post" onClick={() => run(() => w.create())}>New post</button></section>
    {!w.preferences.dismissedIntro && <details className="styling-guidance"><summary>How formatting works</summary><div><p>Styling uses special characters and can affect search and screen-reader pronunciation. Keep key terms and hashtags in ordinary text. Some languages stay unchanged.</p><button onClick={() => void w.setPreference({ dismissedIntro: true })}>Got it</button></div></details>}
    {w.conflict && <aside className="notice danger"><p>This draft changed in another tab. Saving is paused to protect both versions.</p><button onClick={() => run(() => w.keepCopy())}>Keep this tab as a new copy</button><button onClick={() => { setConfirm({ title: 'Reload the saved version?', text: 'Export your current words first if you need them. Reload discards unsaved changes in this tab.', action: () => w.reload() }); }}>Reload saved version</button></aside>}
    {update && <aside className="notice update-notice" role="status"><p><strong>A new version is ready.</strong><br/>Save & update saves your draft and loads the latest version.</p><button className="primary" disabled={busy}  onClick={() => run(async () => { if (!await w.flush()) throw Error('Save is blocked. Export or resolve the conflict before updating.'); navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true }); update.postMessage('ACTIVATE_AFTER_SAVE'); })}>Save & update</button></aside>}
    <div className="mobile-tabs" role="tablist" aria-label="Writing view" onKeyDown={tabKey}><button id="tab-edit" role="tab" aria-controls="panel-edit" tabIndex={tab === 'edit' ? 0 : -1} aria-selected={tab === 'edit'} onClick={() => switchTab('edit')}>Write</button><button id="tab-preview" role="tab" aria-controls="panel-preview" tabIndex={tab === 'preview' ? 0 : -1} aria-selected={tab === 'preview'} onClick={() => switchTab('preview')}>Preview</button></div>
    <div className="writing-controls"><button aria-pressed={focusMode} onClick={() => { setFocusMode(!focusMode); setTab('edit'); }}>{focusMode ? 'Exit writing mode (Esc)' : 'Expand writing mode'}</button><button aria-expanded={comfort} onClick={() => setComfort(!comfort)}>Writing comfort</button><button aria-pressed={!!w.draft.favourite} onClick={() => run(() => w.organise(w.draft, { favourite: !w.draft.favourite }))}>{w.draft.favourite ? '★ Favourited' : '☆ Favourite'}</button><label>Post status<select aria-label="Post status" value={w.draft.status || 'Idea'} onChange={e => void run(() => w.organise(w.draft, { status: e.target.value as Draft['status'] }))}>{['Idea', 'Writing', 'Ready'].map(x => <option key={x}>{x}</option>)}</select></label></div>
    {comfort && <div className="comfort-controls"><label>Font size<select value={w.preferences.fontSize || 18} onChange={e => void w.setPreference({ fontSize: Number(e.target.value) })}>{[16,18,20,22].map(n => <option key={n} value={n}>{n}px</option>)}</select></label><label>Line spacing<select value={w.preferences.lineSpacing || 1.7} onChange={e => void w.setPreference({ lineSpacing: Number(e.target.value) })}>{[1.5,1.7,2].map(n => <option key={n} value={n}>{n}</option>)}</select></label><label>Editor width<select value={w.preferences.editorWidth || 'comfortable'} onChange={e => void w.setPreference({ editorWidth: e.target.value as 'comfortable' | 'wide' })}><option value="comfortable">Comfortable</option><option value="wide">Wide</option></select></label><p>Display settings only. Copied text stays the same.</p></div>}
    <div className={`workspace tab-${tab}`}>

      <section role={mobile ? 'tabpanel' : undefined} aria-labelledby={mobile ? 'tab-edit' : undefined} id="panel-edit" className="editor-card" aria-label="Write"><div className="card-heading"><div><span className="eyebrow">WRITE</span><button className="draft-title" onClick={() => setModal('rename')}>{w.draft.title} <span>✎</span></button></div><span className={`save-status ${w.saveState.startsWith('Could') || w.conflict ? 'error' : w.saveState === 'Saved locally' ? 'saved' : 'pending'}`}>{w.saveState === 'Saved locally' ? '✓ ' : ''}{w.saveState}</span></div>
        <div className="toolbar" role="toolbar" aria-label="Text formatting">
          {button('Bold', () => format('bold'), !!editor?.isActive('bold'), 'bold-button')}{button('Italic', () => format('italic'), !!editor?.isActive('italic'), 'italic-button')}
          {button('Clear formatting', () => { editor?.chain().focus().unsetAllMarks().run(); capture(); })}
          {button('Emoji', () => { capture(); setModal('emoji'); })}<span className="toolbar-divider desktop-only" />
          {button('• List', () => editor && listOperation(editor, 'bullet'), false, 'desktop-only')}{button('1. List', () => editor && listOperation(editor, 'number'), false, 'desktop-only')}
          {button('More', () => { capture(); setModal('tools'); })}<span className="toolbar-spacer" />
          <button className="icon-button" title="Undo (Ctrl/Cmd Z)" aria-label="Undo" disabled={!editor?.can().undo()} onMouseDown={e => e.preventDefault()} onClick={() => editor?.chain().focus().undo().run()}>↶</button>
          <button className="icon-button" title="Redo (Ctrl/Cmd Shift Z)" aria-label="Redo" disabled={!editor?.can().redo()} onMouseDown={e => e.preventDefault()} onClick={() => editor?.chain().focus().redo().run()}>↷</button>
        </div>
        <div className="editor-area" onMouseDown={e => { if (!editor || (e.target as HTMLElement).closest('.ProseMirror, button')) return; e.preventDefault(); const rect = editor.view.dom.getBoundingClientRect(); const hit = editor.view.posAtCoords({ left: Math.max(rect.left + 2, Math.min(e.clientX, rect.right - 2)), top: Math.max(rect.top + 2, Math.min(e.clientY, rect.bottom - 2)) }); editor.chain().focus().setTextSelection(hit?.pos ?? editor.state.doc.content.size - 1).run(); }}><EditorContent editor={editor} />{!sourceText(w.draft.editorDocument) && <div className="empty-hint"><span>Start with your own words or a little inspiration.</span><button onClick={e => { e.stopPropagation(); editor && replaceDocument(editor, example); }}>Try an example ↗</button><button onClick={e => { e.stopPropagation(); capture(); setModal('templates'); }}>Choose a template</button></div>}</div>
        <div className="editor-bottom"><span>{serialized.graphemes.toLocaleString()} characters</span><div><button disabled={busy || !sourceText(w.draft.editorDocument)} onClick={clearDraft}>Clear draft</button><button onClick={() => { capture(); setModal('templates'); }}>▧ Templates</button><button onClick={() => { capture(); setModal('snippets'); }}>＋ Saved text</button></div></div>
      </section>
      <section role={mobile ? 'tabpanel' : undefined} aria-labelledby={mobile ? 'tab-preview' : undefined} id="panel-preview" className="preview-card" aria-label="Preview"><div className="card-heading"><div><span className="eyebrow">PREVIEW</span><h2>{reading ? 'Plain text' : 'Formatted text'}</h2></div><div className="segmented" aria-label="Approximate preview width"><button aria-pressed={previewWidth === 'desktop'} onClick={() => setPreviewWidth('desktop')}>Desktop</button><button aria-pressed={previewWidth === 'mobile'} onClick={() => setPreviewWidth('mobile')}>Mobile</button></div></div>
        <div className="preview-options"><label><input type="checkbox" checked={feed} onChange={e => { setFeed(e.target.checked); setFeedExpanded(false); }} /> Feed preview</label><div className="segmented" aria-label="Text version"><button aria-pressed={!reading} onClick={() => setReading(false)}>Formatted</button><button aria-pressed={reading} onClick={() => setReading(true)}>Plain text</button></div><label><input type="checkbox" checked={showChanges} onChange={e => setShowChanges(e.target.checked)} disabled={reading} /> Show changes</label></div>
        {feed && <div className="feed-heading"><strong>Your LinkedIn post</strong><span>Approximate opening view - actual feed varies</span></div>}
        <div className={`output-wrap ${previewWidth} ${feed && !feedExpanded ? 'feed-collapsed' : ''}`}><div className="output" data-testid="export-output" tabIndex={0} aria-label={reading ? 'Ordinary source reading view' : 'Exact Unicode export'}>{serialized.output ? previewLines.map((line, i) => <span key={i}>{i > 0 && '\n'}<span className="preview-paragraph" role="button" tabIndex={0} aria-label={`Edit paragraph ${line.paragraph + 1}, line ${i + 1}`} title="Click to edit this paragraph" onClick={() => jumpToParagraph(line.paragraph)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); jumpToParagraph(line.paragraph); } }}>{!reading && showChanges ? line.pieces.map((p,j) => <span key={j} className={`piece ${p.kind}`} title={p.kind}>{previewText(p.text)}</span>) : previewText(line.text)}</span></span>) : <span className="preview-placeholder">Your finished words will appear here.<br/><br/>This preview shows the exact text you will copy.</span>}</div></div>
        {feed && serialized.output && <button className="feed-toggle" aria-expanded={feedExpanded} onClick={() => setFeedExpanded(!feedExpanded)}>{feedExpanded ? 'Show opening lines' : '… see more'}</button>}
        {showChanges && !reading && <div className="legend"><span className="substituted">Substituted</span><span className="protected">Protected</span><span className="skipped">Skipped</span></div>}
        <div className="preview-bottom"><span>{reading ? 'Plain text will be copied' : 'Exact text - approximate layout'}</span><button onClick={() => go('/help/compatibility')}>About preview ↗</button></div>
      </section>
    </div>
    <section className="action-row"><div className="counts"><strong>{serialized.graphemes.toLocaleString()} <span>visible characters</span></strong><span className={serialized.units > config.advisoryLimit ? 'error' : ''}>{serialized.units.toLocaleString()} / {config.advisoryLimit.toLocaleString()} estimated limit <button className="info-button" aria-label="Help with counts" onClick={() => go('/help/compatibility')}>ⓘ</button></span></div><div className="copy-actions"><button onClick={() => setModal('export')}>Export ↓</button><button className="primary" disabled={busy || !serialized.output.trim()} onClick={() => run(() => copy(reading))}>⧉ {reading ? 'Copy plain text' : 'Copy formatted text'}</button></div></section>
    <section className="check-panel"><div className="check-summary"><div><span className={`status-dot ${issues.length ? 'notice-dot' : ''}`} /><strong>{issues.length ? 'Review your post' : 'Post guidance'}</strong><span className="muted">{issues.length ? `${issues.length} to check` : 'Optional tips'}</span></div><button onClick={() => setModal('checks')}>View details</button></div><p>{reviewMessage}</p></section>
    <div className="mobile-action-bar"><button onClick={() => { switchTab(tab === 'edit' ? 'preview' : 'edit'); document.getElementById('tab-edit')?.scrollIntoView({ block: 'start', behavior: 'smooth' }); }}>{tab === 'edit' ? 'Preview' : 'Write'}</button><button className="plain-copy" hidden={tab !== 'edit' || reading} disabled={busy || !serialized.output.trim()} onClick={() => run(() => copy(true))}>Copy plain text</button><button className="primary" disabled={busy || !serialized.output.trim()} onClick={() => run(() => copy(reading))}>{reading ? 'Copy plain text' : 'Copy post'}</button></div>
    <section className="trust-strip"><span>♧ Drafts stay on your device</span><span>↶ Formatting is reversible</span><span>✓ No signup. No watermark.</span></section>
    </main>}
    <footer><span>{config.name} · {config.owner}</span><span>An independent tool. Not affiliated with or endorsed by LinkedIn.</span><button onClick={() => go('/help/privacy')}>Privacy</button><button onClick={() => run(() => copy(false, true))}>Share tool ↗</button></footer>
    <div className="live-status" role="status" aria-live="polite" aria-atomic="true">{w.message && <span>{w.message}{w.message === 'Draft cleared.' && canUndoClear && <button className="undo-clear" disabled={busy || !editor?.can().undo()} onClick={() => { editor?.chain().focus().undo().run(); capture(); setCanUndoClear(false); notify('Draft restored.'); }}>Undo</button>}<button aria-label="Dismiss status message" onClick={() => w.notify('')}>×</button></span>}</div>
    <span className="sr-only" aria-live="polite">{w.saveState}</span>
    <input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (!file) return; void run(async () => { if (file.size > config.importBytes) throw Error('Import must be 1 MB or smaller.'); const parsed = parseImport(await file.text()); setModal(null); setImported(parsed); }); }} />

    {modal === 'tools' && <Dialog title="Advanced tools" onClose={() => setModal(null)}>{advancedTools}<button onClick={() => setModal('export')}>Export or import drafts</button></Dialog>}
    {modal === 'rename' && <Dialog title="Name this draft" onClose={() => setModal(null)}><form onSubmit={e => { e.preventDefault(); void run(() => { w.rename(rename); setModal(null); }); }}><label>Draft name<input autoFocus value={rename} maxLength={200} onChange={e => setRename(e.target.value)} /></label><button className="primary" type="submit">Save name</button></form></Dialog>}
    {modal === 'emoji' && <Dialog title="Add an emoji or symbol" onClose={() => setModal(null)} wide><div className="emoji-controls"><input aria-label="Search emoji" placeholder="Search emoji by name or keyword…" value={emojiSearch} onChange={e => { setEmojiSearch(e.target.value); setEmojiLimit(120); }} /><label>Category<select value={category} onChange={e => { setCategory(e.target.value); setEmojiLimit(120); }}>{categories.map(c => <option key={c}>{c}</option>)}</select></label><label>Skin tone<select value={tone} onChange={e => setTone(Number(e.target.value))}><option value={0}>Default</option>{['Light', 'Medium-light', 'Medium', 'Medium-dark', 'Dark'].map((t,i) => <option key={t} value={i+1}>{t}</option>)}</select></label></div><div className="emoji-grid">{filteredEmoji.slice(0, emojiLimit).map(e => <button key={e.id} title={e.name} aria-label={e.name} onClick={() => run(() => insert(tone ? e.tones[tone - 1] || e.emoji : e.emoji, () => { void w.chooseEmoji(e.id); setModal(null); }))}>{tone ? e.tones[tone - 1] || e.emoji : e.emoji}</button>)}</div>{!emoji.length && <p>Loading local emoji metadata…</p>}{emoji.length > 0 && !filteredEmoji.length && <p>No matching emoji. Try another keyword or category.</p>}{filteredEmoji.length > emojiLimit && <button onClick={() => setEmojiLimit(n => n + 120)}>Show more ({filteredEmoji.length - emojiLimit} remaining)</button>}<p className="muted">Native Unicode emoji · dataset {config.emojiVersion} · searched on your device</p></Dialog>}
    {modal === 'find' && <Dialog title="Find and replace" onClose={() => setModal(null)}><label>Find literal text<input value={find} onChange={e => setFind(e.target.value)} /></label><label>Replace with<input value={replacement} onChange={e => setReplacement(e.target.value)} /></label><label className="check-label"><input type="checkbox" checked={sensitive} onChange={e => setSensitive(e.target.checked)} /> Case sensitive</label><p>{matches.length} matches. Search does not cross paragraph boundaries.</p><div className="dialog-actions"><button onClick={() => { if (!editor || !matches.length) { notify('No matches found.'); return; } const m = matches.find(m => m.from >= editor.state.selection.to) || matches[0]; editor.commands.setTextSelection(m); selection.current = { ...m, doc: JSON.stringify(editor.getJSON()), draftId: w.draft.id }; notify('Next match selected in the editor.'); }}>Next match</button><button disabled={!matches.length} onClick={() => run(() => { if (!editor) return; const m = matches.find(m => m.from === editor.state.selection.from) || matches[0]; replaceMatches(editor, [m], replacement); capture(); })}>Replace</button><button className="primary" disabled={!matches.length} onClick={() => run(() => { editor && replaceMatches(editor, matches, replacement); capture(); notify(`Replaced ${matches.length} matches. Undo restores the original text.`); })}>Replace all</button></div></Dialog>}
    {modal === 'templates' && <Dialog title="Start with a structure" onClose={() => setModal(null)} wide><p>Original prompts to organise your thoughts. They do not generate content.</p><div className="template-grid">{templates.map((t,i) => <button key={t.title} aria-pressed={chosenTemplate === i} className={chosenTemplate === i ? 'active' : ''} onClick={() => setChosenTemplate(i)}>{t.title}</button>)}</div><pre className="text-preview">{templates[chosenTemplate].text}</pre><div className="dialog-actions"><button onClick={() => run(() => startTemplate(true))}>Append to draft</button><button className="primary" onClick={() => run(() => startTemplate(false))}>{serialized.plain ? 'Replace draft…' : 'Use template'}</button></div></Dialog>}
    {modal === 'snippets' && <Dialog title="Saved text" onClose={() => setModal(null)} wide><p>Plain text, inserted at your saved caret. {w.snippets.length} / {config.snippetLimit} saved.</p><div className="record-list">{w.snippets.map(s => <div className="record" key={s.id}><div><strong>{s.title}</strong><p>{s.text}</p></div><button onClick={() => run(() => insert(s.text, () => setModal(null)))}>Insert</button><button aria-label={`Delete snippet ${s.title}`} onClick={() => { setModal(null); setConfirm({ title: 'Delete snippet?', text: s.title, destructive: true, action: () => w.saveSnippets(w.snippets.filter(x => x.id !== s.id)) }); }}>Delete</button></div>)}</div><form onSubmit={e => { e.preventDefault(); void run(async () => { if (!snippetName.trim() || !snippetText) throw Error('Give the snippet a name and some text.'); await w.saveSnippets([...w.snippets, { id: crypto.randomUUID(), title: snippetName.trim(), text: snippetText.replace(/\r\n?/g, '\n') }]); setSnippetName(''); setSnippetText(''); }); }}><h3>Save reusable text</h3><label>Name<input value={snippetName} maxLength={200} onChange={e => setSnippetName(e.target.value)} /></label><label>Plain text<textarea value={snippetText} maxLength={config.snippetUnits} onChange={e => setSnippetText(e.target.value)} /></label><button type="submit" className="primary" disabled={w.snippets.length >= config.snippetLimit}>Save text</button></form></Dialog>}
    {modal === 'drafts' && <Dialog title="Your local drafts" onClose={() => setModal(null)} wide><p>Stored in this browser profile. Export a backup before clearing browser data.</p><div className="dialog-actions"><button className="primary" onClick={() => run(async () => { await w.create(); setModal(null); })}>＋ New post</button><button onClick={() => run(async () => jsonDownload('formatter-backup.json', await w.backup()))}>Backup all drafts</button><button onClick={() => fileInput.current?.click()}>Import JSON</button><button onClick={() => run(loadRevisions)}>Recover current draft</button></div><label>Search drafts<input placeholder="Search titles or words..." value={draftSearch} onChange={e => setDraftSearch(e.target.value)} /></label><label>Filter drafts<select value={draftFilter} onChange={e => setDraftFilter(e.target.value)}>{['All', 'Favourites', 'Idea', 'Writing', 'Ready'].map(x => <option key={x}>{x}</option>)}</select></label><div className="record-list">{!listedDrafts.length && <p>No saved drafts yet. Start writing or create a new post.</p>}{listedDrafts.length > 0 && !filteredDrafts.length && <div className="draft-empty-results"><p>No matching drafts. Your saved drafts are still here.</p><button onClick={() => setDraftSearch('')}>Clear search</button></div>}{filteredDrafts.map(d => <div className="record draft-record" key={d.id}><div><strong>{d.id === w.draft.id ? w.draft.title : d.title}{d.id === w.draft.id && <span className="count-badge"> Current</span>}</strong><small>{d.favourite ? '★ Favourite - ' : ''}{d.status || 'Idea'} - {new Date(d.updatedAt).toLocaleString()}</small><div className="draft-organise"><button aria-label={`Favourite ${d.title}`} aria-pressed={!!d.favourite} onClick={() => run(() => w.organise(d, { favourite: !d.favourite }))}>{d.favourite ? '★' : '☆'}</button><select aria-label={`Status for ${d.title}`} value={d.status || 'Idea'} onChange={e => void run(() => w.organise(d, { status: e.target.value as Draft['status'] }))}>{['Idea', 'Writing', 'Ready'].map(x => <option key={x}>{x}</option>)}</select></div><p>{sourceText(d.id === w.draft.id ? w.draft.editorDocument : d.editorDocument).slice(0, 120) || 'Empty draft'}</p></div><button disabled={d.id === w.draft.id} onClick={() => run(async () => { await w.select(d); setModal(null); })}>Open</button><details className="record-menu"><summary aria-label={`Actions for ${d.title}`}>Actions</summary><div><button onClick={() => run(async () => { await w.create(d.id === w.draft.id ? w.draft.editorDocument : d.editorDocument, `${d.title.slice(0, 170)} (copy)`); setModal(null); })}>Duplicate</button><button onClick={() => { setModal(null); setConfirm({ title: 'Delete draft?', text: `Delete “${d.title}” and its recovery revisions from this browser? Export a backup first if needed.`, destructive: true, action: () => w.remove(d) }); }}>Delete</button></div></details></div>)}</div>{w.corrupt.map(d => <div className="notice danger" key={d.id}><p>Unreadable {d.legacy ? 'legacy' : 'corrupted'} draft: {d.id}</p><button onClick={() => run(() => jsonDownload('raw-draft-backup.json', d.raw))}>Export raw backup</button>{d.legacy && <button onClick={() => run(async () => { await storage.migrate(d.raw); await w.refresh(); notify('Legacy draft migrated; original payload retained locally.'); })}>Migrate safely</button>}<button onClick={() => { setModal(null); setConfirm({ title: 'Delete unreadable draft?', text: 'Export its raw backup first. This removes the stored payload.', destructive: true, action: async () => { await storage.remove(d.id); await w.refresh(); } }); }}>Delete</button></div>)}<button className="danger-text" disabled={busy || listedDrafts.length + w.corrupt.length === 0} onClick={() => { setModal(null); setConfirm({ title: 'Delete all drafts?', label: 'Delete all drafts', text: 'Remove all drafts and their recovery revisions from this browser. Saved text, preferences and recent emojis will stay. This cannot be undone.', destructive: true, action: () => w.deleteDrafts() }); }}>Delete all drafts</button></Dialog>}
    {modal === 'recovery' && <Dialog title="Recover a saved revision" onClose={() => setModal(null)}><p>Last three successful saves. Restoring creates a new draft.</p>{!revisions.length && <p>No saved revisions yet.</p>}{[...revisions].reverse().map(d => <div className="record" key={d.revision}><div><strong>Revision {d.revision}</strong><small>{new Date(d.updatedAt).toLocaleString()}</small></div><button onClick={() => { setModal(null); setRestore(d); }}>Preview</button></div>)}</Dialog>}
    {modal === 'checks' && <Dialog title="Review before copying" onClose={() => setModal(null)} wide><label className="check-label"><input type="checkbox" checked={w.preferences.guidance} onChange={e => void w.setPreference({ guidance: e.target.checked })} /> Include optional emphasis, list and emoji guidance</label><div className="check-list">{readiness.map(c => <div key={c.name}><span className={`check-badge ${c.status === 'Pass' ? 'pass' : c.status === 'Notice' ? 'notice' : 'attention'}`}>{c.status}</span><h3>{c.name}</h3><p>{c.detail}</p></div>)}</div><p>These checks cannot certify LinkedIn acceptance, reach, or readability for every reader.</p><button className="primary" onClick={() => run(() => copy(reading))}>{reading ? 'Copy plain text' : 'Copy formatted text'}</button></Dialog>}
    {modal === 'export' && <Dialog title="Export your words" onClose={() => setModal(null)}><div className="export-options"><button onClick={() => download(`${w.draft.title}.txt`, serialized.output)}>Formatted Unicode .txt</button><button onClick={() => download(`${w.draft.title}-plain.txt`, serialized.plain)}>Ordinary source .txt</button><button onClick={() => run(() => jsonDownload(`${w.draft.title}.json`, w.draft))}>Editable draft JSON</button><button onClick={() => run(async () => jsonDownload('formatter-backup.json', await w.backup()))}>All drafts & snippets backup</button><button onClick={() => fileInput.current?.click()}>Import draft or backup JSON</button></div><p className="muted">UTF-8 text with intentional line breaks. JSON retains editable marks; .txt retains the exact export.</p></Dialog>}
    {modal === 'help' && <Dialog title="Help & trust" onClose={() => setModal(null)}><div className="help-links">{helpEntries.map(h => <a key={h.slug} href={`/help/${h.slug}`} onClick={e => { e.preventDefault(); go(`/help/${h.slug}`); }}>{h.title} →</a>)}</div><p>Shortcuts: Ctrl/Cmd B for Bold, I for Italic, Z to Undo, Shift Z to Redo (Ctrl Y also works on Windows).</p><p className="muted">Formatting never promises engagement or algorithmic benefits.</p></Dialog>}
    {confirm && <Dialog title={confirm.title} onClose={() => !busy && setConfirm(null)}><p>{confirm.text}</p><div className="dialog-actions"><button disabled={busy} onClick={() => setConfirm(null)}>Cancel</button><button className={confirm.destructive ? 'danger-button' : 'primary'} disabled={busy} onClick={() => run(async () => { await confirm.action(); setConfirm(null); })}>{busy ? 'Working…' : confirmLabel}</button></div></Dialog>}
    {cleanup && <Dialog title={cleanup.title} onClose={() => setCleanup(null)} wide><p>{cleanup.note}</p><div className="compare"><div><h3>Before</h3><pre className="text-preview">{cleanup.before}</pre></div><div><h3>After · exact export</h3><pre className="text-preview">{serialize(cleanup.doc).output}</pre><h3>Editable source</h3><pre className="text-preview">{sourceText(cleanup.doc)}</pre></div></div><div className="dialog-actions"><button onClick={() => setCleanup(null)}>Cancel</button><button className="primary" onClick={() => run(() => { if (editor) replaceDocument(editor, cleanup.doc); setCleanup(null); notify('Cleanup applied. Undo restores the original input.'); })}>Apply cleanup</button></div></Dialog>}
    {restore && <Dialog title={`Restore revision ${restore.revision}`} onClose={() => setRestore(null)}><pre className="text-preview">{serialize(restore.editorDocument).output}</pre><button className="primary" onClick={() => run(async () => { await w.create(restore.editorDocument, `${restore.title.slice(0, 165)} (recovered)`); setRestore(null); })}>Restore as a new draft</button></Dialog>}
    {imported && <Dialog title={'kind' in imported ? 'Restore this backup?' : 'Import an editable draft'} onClose={() => setImported(null)} wide>{'kind' in imported ? <><p>This replaces all local drafts and snippets with {imported.drafts.length} drafts and {imported.snippets.length} snippets. Export your current backup first.</p><ul>{imported.drafts.map(d => <li key={d.id}>{d.title} · {sourceText(d.editorDocument).length} source units</li>)}</ul></> : <><h3>{imported.title}</h3><pre className="text-preview">{serialize(imported.editorDocument).output}</pre><p>Imports as a new draft; your current draft is retained.</p></>}<div className="dialog-actions"><button onClick={() => setImported(null)}>Cancel</button><button className="primary" onClick={() => run(async () => { await w.importData(imported); setImported(null); notify('Import complete.'); })}>{'kind' in imported ? 'Restore backup' : 'Import draft'}</button></div></Dialog>}
    {manualCopy !== null && <Dialog title="Copy text manually" onClose={() => setManualCopy(null)}><p>The complete output is selected below. Press Ctrl/Cmd C, or use your device’s Copy action, then paste into LinkedIn and check it.</p><textarea ref={manualField} readOnly value={manualCopy} aria-label="Manual copy text" className="manual-copy" /><button onClick={() => { manualField.current?.focus(); manualField.current?.select(); }}>Select all text</button></Dialog>}
  </div>;
}
