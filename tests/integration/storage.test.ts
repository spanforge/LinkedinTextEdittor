import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Store, defaultPreferences } from '../../src/storage';
import { newDraft, fromText, sourceText, type Backup } from '../../src/model';
const store = new Store(); beforeEach(async () => { await store.clear(); });
describe('Draft durability and atomic writes', () => {
  it('keeps spaced checkpoints and named versions after recent saves roll over', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
      let draft = await store.save(newDraft(fromText('Original words')), 0);
      await store.checkpoint(draft.id, 'Before rewriting');
      for (let i = 0; i < 5; i++) draft = await store.save({ ...draft, editorDocument: fromText(`Edit ${i}`) }, draft.revision);
      let entries = await store.recovery(draft.id);
      expect(entries.find(e => e.label === 'Before rewriting')?.draft.editorDocument).toEqual(fromText('Original words'));
      expect(entries.filter(e => e.label.startsWith('Checkpoint'))).toHaveLength(1);
      vi.setSystemTime(new Date('2026-01-01T00:05:00Z'));
      draft = await store.save(draft, draft.revision);
      entries = await store.recovery(draft.id);
      expect(entries.filter(e => e.label.startsWith('Checkpoint'))).toHaveLength(2);
      expect(entries.filter(e => e.label.startsWith('Recent save'))).toHaveLength(3);
      for (let i = 0; i < 12; i++) await store.checkpoint(draft.id, `Named ${i}`);
      expect((await store.recovery(draft.id)).filter(e => e.label.startsWith('Named'))).toHaveLength(10);
      await store.remove(draft.id, draft.revision);
      expect(await store.recovery(draft.id)).toEqual([]);
    } finally { vi.useRealTimers(); }
  });

  it('rejects missing drafts and invalid checkpoint names without creating records', async () => {
    await expect(store.checkpoint('missing', 'A version')).rejects.toThrow('Save this draft');
    await expect(store.checkpoint('missing', '  ')).rejects.toThrow('version name');
    expect(await store.recovery('missing')).toEqual([]);
  });
  it('commits source and marks and keeps only the last three successful revisions', async () => {
    let draft = newDraft(fromText('தமிழ் 👨‍👩‍👧‍👦')); for (let i = 0; i < 5; i++) draft = await store.save(draft, draft.revision);
    expect(await store.get(draft.id)).toEqual(draft); expect((await store.revisions(draft.id)).map(d => d.revision)).toEqual([3,4,5]); expect(sourceText((await store.get(draft.id))!.editorDocument)).toBe('தமிழ் 👨‍👩‍👧‍👦');
  });
  it('rejects simultaneous stale writers without last-write-wins', async () => {
    const d = await store.save(newDraft(), 0); const results = await Promise.allSettled([store.save({ ...d, title: 'Tab one' }, d.revision), store.save({ ...d, title: 'Tab two' }, d.revision)]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1); expect(results.filter(r => r.status === 'rejected')).toHaveLength(1); expect((await store.get(d.id))!.revision).toBe(2);
  });
  it('rejects draft 51 without touching existing drafts', async () => { for (let i = 0; i < 50; i++) await store.save(newDraft(), 0); await expect(store.save(newDraft(), 0)).rejects.toThrow('50 drafts'); expect(await store.list()).toHaveLength(50); });
  it('imports validated backup atomically and rejects malformed backup', async () => {
    const d = await store.save(newDraft(fromText('Original')), 0); const backup: Backup = { schemaVersion: 1, kind: 'backup', drafts: [newDraft(fromText('Imported'))], snippets: [{ id: 's', title: 'Signature', text: 'Regards' }], preferences: defaultPreferences, recent: [] };
    await expect(store.importBackup({ ...backup, drafts: [{ ...d, schemaVersion: 999 } as any] })).rejects.toThrow(); expect(await store.get(d.id)).toEqual(d);
    await store.importBackup(backup); expect(await store.get(d.id)).toBeUndefined(); expect(await store.meta('snippets', [])).toEqual(backup.snippets);
  });
  it('retains legacy payload during migration and does not overwrite on failure', async () => {
    const db = await store.open(); const old = { schemaVersion: 0, id: 'legacy', title: 'Old', text: 'Tamil தமிழ்\r\nHello' }; const tx = db.transaction('drafts', 'readwrite'); tx.objectStore('drafts').put(old); await new Promise(r => { tx.oncomplete = r; });
    const migrated = await store.migrate(old); expect(sourceText(migrated.editorDocument)).toBe('Tamil தமிழ்\nHello');
    const savedOriginal = await new Promise<any>(r => { const req = db.transaction('migrationBackup').objectStore('migrationBackup').get('legacy'); req.onsuccess = () => r(req.result); }); expect(savedOriginal.payload).toEqual(old);
    await expect(store.migrate({ schemaVersion: 0, id: 'bad', text: 'x'.repeat(20001) })).rejects.toThrow(); expect(await store.raw('bad')).toBeUndefined();
  });
});
