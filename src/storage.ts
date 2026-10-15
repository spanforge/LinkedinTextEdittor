import { config } from './config';
import { fromText, newDraft, parseImport, validateDraft, validateDoc, type Backup, type Draft, type Preferences, type Snippet } from './model';
const DB_NAME = 'sriram-linkedin-formatter';
const STORES = ['drafts', 'revisions', 'meta', 'migrationBackup'];
export type RecoveryEntry = { id: string; label: string; draft: Draft };
type RevisionRecord = { id: string; snapshots: Draft[]; checkpoints?: Draft[]; named?: RecoveryEntry[] };
export class ConflictError extends Error { constructor() { super('This draft changed in another tab. Save this tab as a new copy or reload the saved version.'); } }
export class Store {
  private promise?: Promise<IDBDatabase>;
  open(): Promise<IDBDatabase> {
    return this.promise ||= new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => { for (const name of STORES) if (!req.result.objectStoreNames.contains(name)) req.result.createObjectStore(name, { keyPath: 'id' }); };
      req.onsuccess = () => { req.result.onversionchange = () => { req.result.close(); this.promise = undefined; }; resolve(req.result); };
      req.onerror = () => { this.promise = undefined; reject(req.error); };
      req.onblocked = () => { this.promise = undefined; reject(Error('Storage upgrade blocked. Close other formatter tabs.')); };
    });
  }
  async list(): Promise<unknown[]> { const db = await this.open(); return request(db.transaction('drafts').objectStore('drafts').getAll()); }
  async get(id: string): Promise<Draft | undefined> { const db = await this.open(); const d = await request(db.transaction('drafts').objectStore('drafts').get(id)); if (d) validateDraft(d); return d; }
  async raw(id: string): Promise<unknown> { const db = await this.open(); return request(db.transaction('drafts').objectStore('drafts').get(id)); }
  async save(draft: Draft, expected: number): Promise<Draft> {
    validateDraft(draft); const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['drafts', 'revisions'], 'readwrite'); const store = tx.objectStore('drafts'); let failure: Error | null = null;
      const next = { ...draft, updatedAt: new Date().toISOString(), revision: expected + 1 };
      const get = store.get(draft.id); get.onsuccess = () => {
        const existing = get.result;
        if (existing && existing.revision !== expected || !existing && expected !== 0) { failure = new ConflictError(); tx.abort(); return; }
        const count = store.count(); count.onsuccess = () => {
          if (!existing && count.result >= config.draftLimit) { failure = Error('50 drafts reached. Export or delete a draft before creating another.'); tx.abort(); return; }
          store.put(next);
          const revisions = tx.objectStore('revisions'); const read = revisions.get(draft.id);
          read.onsuccess = () => {
            const previous = read.result as RevisionRecord | undefined;
            const checkpoints = previous?.checkpoints || (previous?.snapshots?.length ? [previous.snapshots[0]] : []);
            const last = checkpoints.at(-1);
            const spaced = !last || Date.parse(next.updatedAt) - Date.parse(last.updatedAt) >= 5 * 60_000;
            revisions.put({ id: draft.id, snapshots: [...(previous?.snapshots || []), next].slice(-config.recoveryLimit), checkpoints: (spaced ? [...checkpoints, next] : checkpoints).slice(-12), named: previous?.named || [] });
          };
        };
      };
      tx.oncomplete = () => resolve(next); tx.onerror = () => reject(failure || tx.error || Error('Could not save.')); tx.onabort = () => reject(failure || tx.error || Error('Could not save.'));
    });
  }
  async remove(id: string, expected?: number): Promise<void> {
    const db = await this.open(); const tx = db.transaction(['drafts', 'revisions'], 'readwrite');
    let conflict = false; const read = tx.objectStore('drafts').get(id);
    read.onsuccess = () => { if (expected !== undefined && read.result && read.result.revision !== expected) { conflict = true; tx.abort(); } else { tx.objectStore('drafts').delete(id); tx.objectStore('revisions').delete(id); } };
    try { await complete(tx); } catch (e) { if (conflict) throw new ConflictError(); throw e; }
  }
  async revisions(id: string): Promise<Draft[]> { const db = await this.open(); const v = await request(db.transaction('revisions').objectStore('revisions').get(id)); return (v?.snapshots || []).filter((d: unknown) => { try { validateDraft(d); return true; } catch { return false; } }); }
  async recovery(id: string): Promise<RecoveryEntry[]> {
    const db = await this.open();
    const record = await request<RevisionRecord | undefined>(db.transaction('revisions').objectStore('revisions').get(id));
    const entries = [
      ...(record?.named || []),
      ...(record?.snapshots || []).map(draft => ({ id: `recent-${draft.revision}`, label: `Recent save ${draft.revision}`, draft })),
      ...(record?.checkpoints || []).map(draft => ({ id: `checkpoint-${draft.revision}`, label: `Checkpoint ${draft.revision}`, draft })),
    ];
    return entries.filter(entry => { try { validateDraft(entry.draft); return typeof entry.label === 'string'; } catch { return false; } })
      .sort((a, b) => b.draft.updatedAt.localeCompare(a.draft.updatedAt));
  }
  async checkpoint(id: string, label: string): Promise<void> {
    label = label.trim(); if (!label || label.length > 100) throw Error('Use a version name from 1 to 100 characters.');
    const db = await this.open(); const tx = db.transaction(['drafts', 'revisions'], 'readwrite');
    let missing = false;
    const read = tx.objectStore('drafts').get(id);
    read.onsuccess = () => {
      if (!read.result) { missing = true; tx.abort(); return; }
      const draft = read.result as Draft;
      const versions = tx.objectStore('revisions'); const saved = versions.get(id);
      saved.onsuccess = () => {
        const record = saved.result as RevisionRecord | undefined;
        versions.put({ ...record, id, snapshots: record?.snapshots || [], named: [...(record?.named || []), { id: crypto.randomUUID(), label, draft }].slice(-10) });
      };
    };
    try { await complete(tx); } catch (error) { if (missing) throw Error('Save this draft before naming a version.'); throw error; }
  }
  async meta<T>(id: string, fallback: T): Promise<T> { const db = await this.open(); const v = await request(db.transaction('meta').objectStore('meta').get(id)); return v ? v.value as T : fallback; }
  async setMeta(id: string, value: unknown): Promise<void> { const db = await this.open(); const tx = db.transaction('meta', 'readwrite'); tx.objectStore('meta').put({ id, value }); await complete(tx); }
  async clear(): Promise<void> { const db = await this.open(); const tx = db.transaction(STORES, 'readwrite'); for (const name of STORES) tx.objectStore(name).clear(); await complete(tx); }
  async clearDrafts(): Promise<void> {
    const db = await this.open(); const tx = db.transaction(STORES, 'readwrite');
    for (const name of ['drafts', 'revisions', 'migrationBackup']) tx.objectStore(name).clear();
    tx.objectStore('meta').delete('active'); await complete(tx);
  }
  async importBackup(backup: Backup): Promise<void> {
    parseImport(JSON.stringify(backup));
    const db = await this.open(); const tx = db.transaction(['drafts', 'revisions', 'meta'], 'readwrite');
    for (const name of ['drafts', 'revisions']) tx.objectStore(name).clear();
    for (const d of backup.drafts) { tx.objectStore('drafts').put(d); tx.objectStore('revisions').put({ id: d.id, snapshots: [d] }); }
    const meta = tx.objectStore('meta'); meta.clear();
    for (const [id, value] of Object.entries({ snippets: backup.snippets, preferences: backup.preferences, recent: backup.recent })) meta.put({ id, value });
    await complete(tx);
  }
  async migrate(raw: unknown): Promise<Draft> {
    // Only the documented legacy schema is accepted; retain the original atomically.
    const old = raw as { schemaVersion?: number; id?: string; title?: string; text?: string };
    if (old?.schemaVersion !== 0 || typeof old.text !== 'string' || typeof old.id !== 'string') throw Error('Unsupported migration. Export the original payload before deletion.');
    const next = { ...newDraft(undefined, old.title || 'Recovered legacy post'), id: old.id };
    next.editorDocument = fromText(old.text); validateDoc(next.editorDocument); validateDraft(next);
    const db = await this.open(); const tx = db.transaction(['drafts', 'migrationBackup', 'revisions'], 'readwrite');
    const read = tx.objectStore('drafts').get(old.id); let mismatch = false;
    read.onsuccess = () => { if (JSON.stringify(read.result) !== JSON.stringify(raw)) { mismatch = true; tx.abort(); return; } tx.objectStore('migrationBackup').put({ id: old.id, payload: raw }); tx.objectStore('drafts').put(next); tx.objectStore('revisions').put({ id: old.id, snapshots: [next] }); };
    try { await complete(tx); } catch(e) { if (mismatch) throw new ConflictError(); throw e; } return next;
  }
}
function request<T = any>(req: IDBRequest<T>): Promise<T> { return new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); }); }
function complete(tx: IDBTransaction): Promise<void> { return new Promise((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error || Error('Storage transaction aborted.')); }); }
export const storage = new Store();
export const defaultPreferences: Preferences = { theme: 'light', guidance: true, dismissedIntro: false };
export type LocalData = { snippets: Snippet[]; preferences: Preferences; recent: string[] };
