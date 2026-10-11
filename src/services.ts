export function download(name: string, content: string, type = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type })); const a = document.createElement('a'); a.href = url; a.download = name.replace(/[\\/:*?"<>|]/g, '-'); a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function copyText(text: string): Promise<void> { if (!text.trim()) throw Error('Write or paste a post first.'); if (!navigator.clipboard?.writeText) throw Error('Clipboard is unavailable. Select and copy the text manually.'); await navigator.clipboard.writeText(text); }
export function exportJSON(name: string, value: unknown, cap: number): boolean {
  const pretty = JSON.stringify(value, null, 2); const compact = JSON.stringify(value);
  const content = new TextEncoder().encode(pretty).length <= cap ? pretty : compact;
  download(name, content, 'application/json'); return new TextEncoder().encode(content).length <= cap;
}
export type EmojiEntry = { id: string; name: string; keywords: string; category: string; emoji: string; tones: string[] };
let emojiPromise: Promise<EmojiEntry[]> | undefined;
export const loadEmoji = () => emojiPromise ||= fetch('/data/emoji.json').then(r => { if (!r.ok) throw Error('Emoji data unavailable. Load once online to enable offline emoji search.'); return r.json() as Promise<EmojiEntry[]>; }).catch(e => { emojiPromise = undefined; throw e; });
