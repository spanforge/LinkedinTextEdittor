export const config = {
  name: 'LinkedIn Text Formatter', owner: 'Sriram Advisory', publicUrl: import.meta.env.VITE_PUBLIC_URL || '',
  schemaVersion: 1, advisoryLimit: 3000, cautionRatio: .9, sourceLimit: 20000, draftLimit: 50,
  snippetLimit: 30, snippetUnits: 1000, importBytes: 1_000_000, autosaveMs: 800, checksMs: 150,
  recoveryLimit: 3, historyDepth: 100, emphasisRatio: .2, previewMobile: 360, previewDesktop: 600,
  emojiVersion: '16.0.0', mobileBreakpoint: 768, maxWidth: 1200,
} as const;
