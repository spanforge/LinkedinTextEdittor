import { memo, useMemo, useState } from 'react';
import type { Doc } from '../model';
import { segments, type Serialized } from '../unicode';

function PreviewText({ text }: { text: string }) {
  const runs: { text: string; strike: boolean }[] = [];
  for (const { segment } of segments(text)) {
    const strike = /[\u0335\u0336]/u.test(segment);
    if (runs.at(-1)?.strike === strike) runs.at(-1)!.text += segment;
    else runs.push({ text: segment, strike });
  }
  return runs.map((run, i) => run.strike ? <span className="preview-strike" key={i}>{Array.from(run.text).map((c, j) => /[\u0335\u0336]/u.test(c) ? <span className="preview-stroke-character" key={j}>{c}</span> : c)}</span> : run.text);
}

export const PostPreview = memo(function PostPreview({ doc, serialized, reading, showChanges, onNavigate }: {
  doc: Doc; serialized: Serialized; reading: boolean; showChanges: boolean;
  onNavigate: (paragraph: number, keyboard: boolean) => void;
}) {
  const [active, setActive] = useState(0);
  const lines = useMemo(() => {
    let line = 0;
    const pieces: { text: string; kind: string }[][] = [[]];
    for (const piece of serialized.pieces) piece.text.split('\n').forEach((text, i) => {
      if (i) pieces[++line] = [];
      pieces[line].push({ text, kind: piece.kind });
    });
    const text = (reading ? serialized.plain : serialized.output).split('\n');
    let index = 0;
    return doc.content.flatMap((p, paragraph) => Array.from({ length: 1 + (p.content || []).filter(n => n.type === 'hardBreak').length }, () => {
      const i = index++; return { paragraph, text: text[i] || '', pieces: pieces[i] || [] };
    }));
  }, [doc, serialized, reading]);
  return <div className="output" data-testid="export-output" tabIndex={serialized.output ? -1 : 0} aria-label={reading ? 'Ordinary source reading view' : 'Exact Unicode export'}>{serialized.output ? lines.map((line, i) => <span key={i}>{i > 0 && '\n'}<span className="preview-paragraph" role="button" tabIndex={i === Math.min(active, lines.length - 1) ? 0 : -1} aria-label={`Edit paragraph ${line.paragraph + 1}, line ${i + 1}`} aria-describedby={`preview-text-${i}`} title="Click to edit; use arrow keys to navigate lines" onFocus={() => setActive(i)} onClick={() => onNavigate(line.paragraph, false)} onKeyDown={e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onNavigate(line.paragraph, true); }
    else if (['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) {
      e.preventDefault(); const next = e.key === 'Home' ? 0 : e.key === 'End' ? lines.length - 1 : Math.max(0, Math.min(lines.length - 1, i + (e.key === 'ArrowUp' ? -1 : 1)));
      setActive(next); (e.currentTarget.closest('.output')?.querySelectorAll<HTMLElement>('.preview-paragraph')[next])?.focus();
    }
  }}><span id={`preview-text-${i}`}>{!reading && showChanges ? line.pieces.map((p, j) => <span key={j} className={`piece ${p.kind}`} title={p.kind}><PreviewText text={p.text} /></span>) : <PreviewText text={line.text} />}</span></span></span>) : <span className="preview-placeholder">Your finished words will appear here.<br/><br/>This preview shows the exact text you will copy.</span>}</div>;
});
