import { useEffect, useState } from 'react';
import { storage } from '../storage';

export function useBackupReminder() {
  const [lastBackup, setLastBackup] = useState<string | null>(null);
  const [snoozed, setSnoozed] = useState(false);
  useEffect(() => { void storage.meta<string | null>('lastBackup', null).then(value => {
    if (value && Number.isFinite(Date.parse(value))) setLastBackup(value);
  }).catch(() => {}); }, []);
  async function recordBackup() {
    const now = new Date().toISOString(); setLastBackup(now); setSnoozed(true);
    try { await storage.setMeta('lastBackup', now); } catch { /* Download already started; date remains available in this tab. */ }
  }
  return { lastBackup, recordBackup, backupDue: !snoozed && (!lastBackup || Date.now() - Date.parse(lastBackup) > 7 * 86400000), snooze: () => setSnoozed(true) };
}
