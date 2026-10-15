import { useEffect, useRef } from 'react';

export function useWritingLayout(focusMode: boolean) {
  const controls = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = controls.current;
    if (!node) return;
    const update = () => node.closest<HTMLElement>('.app-shell')?.style.setProperty('--controls-height', `${node.getBoundingClientRect().height}px`);
    const observer = new ResizeObserver(update); observer.observe(node); update();
    return () => observer.disconnect();
  }, [focusMode]);
  return controls;
}
