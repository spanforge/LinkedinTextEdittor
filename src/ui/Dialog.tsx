import { useEffect, useRef, type ReactNode } from 'react';
export function Dialog({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null); const close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null; const dialog = ref.current!; dialog.showModal();
    const cancel = (e: Event) => { e.preventDefault(); close.current(); }; dialog.addEventListener('cancel', cancel);
    return () => { dialog.removeEventListener('cancel', cancel); dialog.close(); if (previous?.isConnected) previous.focus(); };
  }, []);
  return <dialog ref={ref} className={wide ? 'dialog wide' : 'dialog'} aria-labelledby="dialog-title" onClick={e => { if (e.target === ref.current) onClose(); }}>
    <div className="dialog-heading"><h2 id="dialog-title">{title}</h2><button className="icon-button" aria-label="Close dialog" onClick={onClose}>×</button></div><div className="dialog-content">{children}</div>
  </dialog>;
}
