import { useEffect, useRef, useState } from 'react';
import { config } from './config';
import { newDraft, validateDraft, validatePreferences, validateSnippets, type Backup, type Doc, type Draft, type Preferences, type Snippet } from './model';
import { ConflictError, defaultPreferences, storage } from './storage';

export function useWorkbench() {
  const [draft, setDraft] = useState<Draft>(newDraft()); const current = useRef(draft);
  const [drafts, setDrafts] = useState<Draft[]>([]); const [corrupt, setCorrupt] = useState<{ id: string; raw: unknown; legacy: boolean }[]>([]);
  const [ready, setReady] = useState(false), [saveState, setSaveState] = useState('Loading local drafts…'), [message, setMessage] = useState('');
  const [conflict, setConflict] = useState(false); const conflictRef = useRef(false);
  const [preferences, setPreferences] = useState<Preferences>(defaultPreferences);
  const [snippets, setSnippets] = useState<Snippet[]>([]), [recent, setRecent] = useState<string[]>([]);
  const [change, setChange] = useState(0); const dirty = useRef(false), editVersion = useRef(0), composing = useRef(false);
  const [loadVersion, setLoadVersion] = useState(0);
  const [resumeSelection, setResumeSelection] = useState<{ from: number; to: number } | undefined>();
  const saving = useRef<Promise<boolean> | null>(null), channel = useRef<BroadcastChannel | null>(null); const tabId = useRef(crypto.randomUUID());
  const maintenance = useRef(false);
  const alive = useRef(true);
  const notify = (text: string) => setMessage(text);
  function adopt(d: Draft, isDirty = false) { current.current = d; setDraft(d); dirty.current = isDirty; editVersion.current++; setChange(c => c + 1); }
  async function refresh() {
    const raw = await storage.list(); const valid: Draft[] = [], invalid: typeof corrupt = [];
    for (const item of raw) { try { validateDraft(item); valid.push(item); } catch { const x = item as { id?: string; schemaVersion?: number }; if (typeof x?.id === 'string') invalid.push({ id: x.id, raw: item, legacy: x.schemaVersion === 0 }); } }
    valid.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)); setDrafts(valid); setCorrupt(invalid); return valid;
  }
  function markConflict() { conflictRef.current = true; setConflict(true); setSaveState('Conflict — saving paused'); }
  function clearConflict() { conflictRef.current = false; setConflict(false); }
  async function flush(): Promise<boolean> {
    if (composing.current || conflictRef.current || maintenance.current) return false;
    if (saving.current) { await saving.current; if (dirty.current && !conflictRef.current) return flush(); return !dirty.current; }
    if (!dirty.current) return true;
    const snapshot = current.current, version = editVersion.current;
    setSaveState('Saving…');
    saving.current = (async () => {
      try {
        const saved = await storage.save(snapshot, snapshot.revision);
        if (current.current.id === saved.id) {
          const merged = version === editVersion.current ? saved : { ...current.current, revision: saved.revision, updatedAt: saved.updatedAt };
          current.current = merged; if (alive.current) setDraft(merged); dirty.current = version !== editVersion.current;
          if (alive.current) setSaveState(dirty.current ? 'Saving…' : 'Saved locally');
        }
        channel.current?.postMessage({ type: 'save', id: saved.id, revision: saved.revision, tab: tabId.current });
        if (alive.current) await refresh(); return true;
      } catch (e) {
        if (e instanceof ConflictError) markConflict(); else setSaveState('Could not save — working in memory');
        notify(`${e instanceof Error ? e.message : 'Local storage unavailable.'} Your current words remain in this tab. Export a backup.`); return false;
      } finally { saving.current = null; }
    })();
    const result = await saving.current;
    if (result && dirty.current && !conflictRef.current) return flush();
    return result;
  }
  const flushRef = useRef(flush); flushRef.current = flush;
  useEffect(() => {
    alive.current = true;
    (async () => {
      try {
        const list = await refresh(); const active = await storage.meta<{ id?: string; selection?: { from: number; to: number } }>('active', {});
        const chosen = list.find(d => d.id === active.id) || list[0];
        if (chosen) { adopt(chosen); setSaveState('Saved locally'); if (active.id === chosen.id) setResumeSelection(active.selection); }
        else { adopt(newDraft(), true); setSaveState('New local draft'); }
        const pref = await storage.meta('preferences', defaultPreferences); validatePreferences(pref); setPreferences(pref);
        const snips = await storage.meta<Snippet[]>('snippets', []); validateSnippets(snips); setSnippets(snips);
        const rec = await storage.meta<string[]>('recent', []); if (Array.isArray(rec) && rec.length <= 30 && rec.every(s => typeof s === 'string' && s.length < 100)) setRecent(rec);
      } catch { adopt(newDraft(), true); setSaveState('Could not load storage — working in memory'); notify('Local storage could not be loaded. Saved drafts have not been overwritten. You can edit and export this draft.'); }
      finally { if (alive.current) setReady(true); }
    })();
    let bc: BroadcastChannel | undefined;
    if ('BroadcastChannel' in window) {
      bc = new BroadcastChannel('formatter-drafts'); channel.current = bc;
      bc.onmessage = async ({ data }) => {
        if (data.tab === tabId.current) return;
        if (data.type === 'reset' || (data.id === current.current.id && (data.type === 'delete' || data.revision > current.current.revision))) markConflict();
        try { await refresh(); } catch { /* Working draft stays in memory. */ }
      };
    }
    const visibility = () => { if (document.visibilityState === 'hidden') void flushRef.current(); };
    const beforeUnload = (event: BeforeUnloadEvent) => { if (dirty.current || composing.current || conflictRef.current) { event.preventDefault(); event.returnValue = ''; } };
    document.addEventListener('visibilitychange', visibility); window.addEventListener('beforeunload', beforeUnload);
    return () => { alive.current = false; bc?.close(); document.removeEventListener('visibilitychange', visibility); window.removeEventListener('beforeunload', beforeUnload); };
  }, []);
  useEffect(() => { if (!ready || composing.current) return; const timer = setTimeout(() => { void flushRef.current(); }, config.autosaveMs); return () => clearTimeout(timer); }, [change, ready]);
  useEffect(() => { document.documentElement.dataset.theme = preferences.theme; }, [preferences.theme]);

  function edit(doc: Doc) { adopt({ ...current.current, editorDocument: doc }, true); if (!conflictRef.current) setSaveState('Unsaved changes'); }
  function rename(title: string) { if (!title.trim() || title.length > 200) throw Error('Use a name from 1 to 200 characters.'); adopt({ ...current.current, title: title.trim() }, true); }
  async function select(d: Draft) { if (!await flush()) throw Error('Save is blocked. Resolve the conflict or export the current draft before switching.'); const fresh = await storage.get(d.id); if (!fresh) throw Error('This draft is no longer available.'); adopt(fresh); setResumeSelection(undefined); clearConflict(); setSaveState('Saved locally'); await storage.setMeta('active', { id: fresh.id }); }
  async function create(doc?: Doc, title?: string, allowConflict = false) {
    if (!allowConflict && !await flush()) throw Error('Export this draft or resolve its save failure before creating another.');
    const count = (await storage.list()).length; if (count >= config.draftLimit) throw Error('50 drafts reached. Export or delete a draft first.');
    const d = newDraft(doc, title); const saved = await storage.save(d, 0); adopt(saved); clearConflict(); setResumeSelection(undefined); setSaveState('Saved locally'); await refresh(); await storage.setMeta('active', { id: saved.id }); channel.current?.postMessage({ type: 'save', id: saved.id, revision: saved.revision, tab: tabId.current });
  }
  async function keepCopy() { await create(current.current.editorDocument, `${current.current.title.slice(0, 170)} (copy)`, true); }
  async function reload() { const saved = await storage.get(current.current.id); if (!saved) throw Error('The saved draft was removed. Keep this tab as a new copy.'); adopt(saved); setLoadVersion(v => v + 1); clearConflict(); setSaveState('Saved locally'); }
  async function remove(d: Draft) {
    if (d.id === current.current.id && !await flush()) throw Error('Resolve the save failure before deleting the active draft.');
    const latest = d.id === current.current.id ? current.current : d; await storage.remove(d.id, latest.revision);
    channel.current?.postMessage({ type: 'delete', id: d.id, tab: tabId.current }); const list = await refresh();
    if (d.id === current.current.id) { adopt(list[0] || newDraft(), !list.length); clearConflict(); setSaveState(list.length ? 'Saved locally' : 'New local draft'); }
  }
  async function setPreference(patch: Partial<Preferences>) { const next = { ...preferences, ...patch }; setPreferences(next); try { await storage.setMeta('preferences', next); } catch { notify('Preference could not be saved. It remains active in this tab.'); } }
  async function saveSnippets(next: Snippet[]) { validateSnippets(next); await storage.setMeta('snippets', next); setSnippets(next); }
  async function chooseEmoji(id: string) { const next = [id, ...recent.filter(x => x !== id)].slice(0, 30); setRecent(next); try { await storage.setMeta('recent', next); } catch { notify('Recent emoji history could not be saved.'); } }
  async function backup(): Promise<Backup> {
    let all = drafts; try { all = await refresh(); } catch { /* Export available without storage. */ }
    const others = all.filter(d => d.id !== current.current.id); const active = current.current;
    return { schemaVersion: 1, kind: 'backup', drafts: [...others, active], snippets, preferences, recent };
  }
  async function importData(data: Draft | Backup) {
    if ('kind' in data) {
      if (!await flush()) throw Error('Resolve or export unsaved changes before restoring a backup.');
      maintenance.current = true;
      try { if (saving.current) await saving.current; await storage.importBackup(data); setSnippets(data.snippets); setPreferences(data.preferences); setRecent(data.recent); adopt(data.drafts[0] || newDraft(), !data.drafts.length); setLoadVersion(v => v + 1); clearConflict(); setResumeSelection(undefined); await refresh(); channel.current?.postMessage({ type: 'reset', tab: tabId.current }); }
      finally { maintenance.current = false; }
    } else await create(data.editorDocument, data.title);
  }
  async function deleteAll() { maintenance.current = true; try { if (saving.current) await saving.current; await storage.clear(); setSnippets([]); setRecent([]); setPreferences(defaultPreferences); adopt(newDraft(), true); clearConflict(); await refresh(); channel.current?.postMessage({ type: 'reset', tab: tabId.current }); setSaveState('Local data removed; new empty draft'); } finally { maintenance.current = false; } }
  async function saveCaret(selection: { from: number; to: number }) { if (!ready || composing.current) return; try { await storage.setMeta('active', { id: current.current.id, selection }); } catch { /* Caret persistence is best effort. */ } }
  return { draft, drafts, corrupt, ready, saveState, message, notify, conflict, preferences, snippets, recent, resumeSelection, loadVersion, composing, edit, rename, flush, select, create, keepCopy, reload, remove, setPreference, saveSnippets, chooseEmoji, backup, importData, deleteAll, saveCaret, refresh };
}
export type Workbench = ReturnType<typeof useWorkbench>;
