import { useEffect, useRef, useState } from 'react';

interface Props {
  text: string;
  children: React.ReactNode;
  delay?: number;
  position?: 'top' | 'bottom' | 'left' | 'right';
  style?: React.CSSProperties;
}

export function Tooltip({ text, children, delay = 400, position = 'bottom', style }: Props) {
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const show = () => {
    timerRef.current = setTimeout(() => setVisible(true), delay);
  };

  const hide = () => {
    clearTimeout(timerRef.current);
    setVisible(false);
    setCoords(null);
  };

  useEffect(() => {
    if (!visible || !triggerRef.current || !tooltipRef.current) return;

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const tipRect = tooltipRef.current.getBoundingClientRect();
    const pad = 6;

    let top: number;
    let left: number;

    switch (position) {
      case 'top':
        top = triggerRect.top - tipRect.height - pad;
        left = triggerRect.left + triggerRect.width / 2 - tipRect.width / 2;
        break;
      case 'bottom':
        top = triggerRect.bottom + pad;
        left = triggerRect.left + triggerRect.width / 2 - tipRect.width / 2;
        break;
      case 'left':
        top = triggerRect.top + triggerRect.height / 2 - tipRect.height / 2;
        left = triggerRect.left - tipRect.width - pad;
        break;
      case 'right':
        top = triggerRect.top + triggerRect.height / 2 - tipRect.height / 2;
        left = triggerRect.right + pad;
        break;
    }

    // Clamp to viewport
    left = Math.max(4, Math.min(left, window.innerWidth - tipRect.width - 4));
    top = Math.max(4, Math.min(top, window.innerHeight - tipRect.height - 4));

    setCoords({ top, left });
  }, [visible, position]);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  return (
    <div
      ref={triggerRef}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      style={{ display: 'inline-flex', ...style }}
    >
      {children}
      {visible && (
        <div
          ref={tooltipRef}
          style={{
            position: 'fixed',
            top: coords?.top ?? -9999,
            left: coords?.left ?? -9999,
            padding: '4px 8px',
            fontSize: 12,
            lineHeight: 1.3,
            maxWidth: 'calc(100vw - 8px)',
            whiteSpace: 'normal',
            wordBreak: 'break-word',
            background: 'var(--vscode-editorHoverWidget-background, #252526)',
            color: 'var(--vscode-editorHoverWidget-foreground, #ccc)',
            border: '1px solid var(--vscode-editorHoverWidget-border, #454545)',
            borderRadius: 3,
            boxShadow: '0 2px 8px rgba(0,0,0,0.36)',
            zIndex: 1000,
            pointerEvents: 'none',
            opacity: coords ? 1 : 0,
          }}
        >
          {text}
        </div>
      )}
    </div>
  );
}
