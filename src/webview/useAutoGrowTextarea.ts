import { useLayoutEffect, useRef } from 'react';

import type { Textarea } from './components/InputComponents';

type TextareaRef = React.ComponentRef<typeof Textarea>;

export function useAutoGrowTextarea(value: string, minHeight: number, maxHeight: number) {
  const ref = useRef<TextareaRef>(null);

  useLayoutEffect(() => {
    const host = ref.current;
    if (!host) return;
    const resize = () => {
      void host.updateComplete.then(() => {
        const inner = host.wrappedElement;
        if (!inner) return;
        inner.style.lineHeight = '1.5';
        inner.style.height = 'auto';
        const next = Math.min(Math.max(inner.scrollHeight, minHeight), maxHeight);
        inner.style.height = '';
        host.style.height = `${next}px`;
      });
    };
    resize();
    let lastWidth = host.clientWidth;
    const ro = new ResizeObserver(() => {
      if (host.clientWidth !== lastWidth) {
        lastWidth = host.clientWidth;
        resize();
      }
    });
    ro.observe(host);
    return () => ro.disconnect();
  }, [value, minHeight, maxHeight]);

  return ref;
}
