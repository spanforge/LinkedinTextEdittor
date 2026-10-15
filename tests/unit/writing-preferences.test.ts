import { describe, expect, it } from 'vitest';
import { newDraft, parseImport, validatePreferences } from '../../src/model';

describe('writing settings and draft organisation', () => {
  it('imports old drafts and preserves new organisation on export/import', () => {
    const draft = newDraft();
    expect(parseImport(JSON.stringify(draft))).toEqual(draft);
    const organised = { ...draft, favourite: true, status: 'Ready' };
    expect(parseImport(JSON.stringify(organised))).toEqual(organised);
    expect(() => parseImport(JSON.stringify({ ...draft, status: 'invalid' }))).toThrow();
  });
  it('accepts legacy settings and validates comfort values without coercion', () => {
    const original = { theme: 'light', guidance: true, dismissedIntro: false };
    expect(() => validatePreferences(original)).not.toThrow();
    expect(() => validatePreferences({ ...original, fontSize: 22, lineSpacing: 2, editorWidth: 'wide' })).not.toThrow();
    for (const patch of [{ fontSize: '22' }, { fontSize: 999 }, { lineSpacing: 0 }, { editorWidth: 'invalid' }]) {
      expect(() => validatePreferences({ ...original, ...patch })).toThrow();
    }
  });
});
