import { CaretDownIcon, CaretRightIcon } from '@phosphor-icons/react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { CopyButton } from './CopyButton';

interface Props {
  prompt: string;
  refining?: boolean;
}

type UpdateStatus = 'idle' | 'updating' | 'updated';

// Max expanded height before the drawer starts scrolling internally is half of its
// parent container — leaves the questioning stream clearly visible. For shorter
// prompts the drawer sizes to content; users can drag the bottom-right corner, but
// the drag is capped at the same half-parent limit (and at content height).
const MIN_HEIGHT_PX = 60;

export function PromptDrawer({ prompt, refining }: Props) {
  const [collapsed, setCollapsed] = useState(true);
  const [status, setStatus] = useState<UpdateStatus>('idle');
  const [userHeight, setUserHeight] = useState<number | null>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [parentH, setParentH] = useState(0);
  const prevRefining = useRef(!!refining);
  const drawerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const toggle = () => setCollapsed((c) => !c);

  useLayoutEffect(() => {
    if (collapsed) return;
    const parent = drawerRef.current?.parentElement;
    if (!parent) return;
    const update = () => setParentH(parent.clientHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(parent);
    return () => ro.disconnect();
  }, [collapsed]);

  const displayMaxHeight = parentH > 0 ? Math.floor(parentH / 2) : undefined;

  useLayoutEffect(() => {
    if (collapsed) {
      setIsOverflowing(false);
      return;
    }
    const el = textRef.current;
    if (!el) return;
    const check = () => setIsOverflowing(el.scrollHeight > el.clientHeight);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [collapsed, prompt, userHeight]);

  useEffect(() => {
    const wasRefining = prevRefining.current;
    prevRefining.current = !!refining;
    if (refining) {
      setStatus('updating');
    } else if (wasRefining) {
      setStatus('updated');
      const timer = setTimeout(() => setStatus('idle'), 2500);
      return () => clearTimeout(timer);
    }
  }, [refining]);

  const applyDelta = useCallback((deltaY: number) => {
    const drawer = drawerRef.current;
    if (!drawer) return;
    const parent = drawer.parentElement;
    const parentHeight = parent?.clientHeight ?? 0;
    let maxH = parentHeight > 0 ? Math.floor(parentHeight / 2) : MIN_HEIGHT_PX;
    const text = textRef.current;
    if (text) {
      const chrome = drawer.offsetHeight - text.clientHeight;
      maxH = Math.min(maxH, text.scrollHeight + chrome);
    }
    setUserHeight((h) => {
      const current = h ?? drawer.offsetHeight;
      return Math.max(MIN_HEIGHT_PX, Math.min(maxH, current + deltaY));
    });
  }, []);

  const onGripPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      const el = e.currentTarget;
      el.setPointerCapture(e.pointerId);
      let lastY = e.clientY;
      const onMove = (ev: PointerEvent) => {
        applyDelta(ev.clientY - lastY);
        lastY = ev.clientY;
      };
      const onUp = (ev: PointerEvent) => {
        el.releasePointerCapture(ev.pointerId);
        el.removeEventListener('pointermove', onMove);
        el.removeEventListener('pointerup', onUp);
        el.removeEventListener('pointercancel', onUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
      el.addEventListener('pointermove', onMove);
      el.addEventListener('pointerup', onUp);
      el.addEventListener('pointercancel', onUp);
      document.body.style.cursor = 'nwse-resize';
      document.body.style.userSelect = 'none';
    },
    [applyDelta],
  );

  const cardStyle: React.CSSProperties = {
    fontSize: 12,
    lineHeight: 1.4,
    minWidth: 0,
    padding: '8px 10px',
    borderRadius: 4,
    background: 'var(--vscode-textBlockQuote-background)',
    boxSizing: 'border-box',
  };

  if (collapsed) {
    return (
      <div
        onClick={toggle}
        style={{
          ...cardStyle,
          flexShrink: 0,
          display: 'flex',
          gap: 6,
          alignItems: 'center',
          cursor: 'pointer',
        }}
      >
        <CaretRightIcon size={12} style={{ flexShrink: 0 }} />
        <div
          style={{
            flex: 1,
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {prompt || 'Prompt'}
        </div>
        {status !== 'idle' && (
          <span
            style={{
              fontSize: 11,
              opacity: 0.85,
              flexShrink: 0,
              color: status === 'updating' ? '#d4a017' : '#4caf50',
              transition: 'opacity 200ms ease',
            }}
          >
            {status === 'updating' ? 'Updating' : 'Updated'}
          </span>
        )}
        {prompt && (
          <CopyButton
            text={prompt}
            title="Copy prompt"
            style={{ padding: '0 4px', flexShrink: 0, display: 'flex', alignItems: 'center' }}
          />
        )}
      </div>
    );
  }

  // Expanded: caret row stays in the same place as collapsed; prompt text
  // wraps from the first line downward as the continuation. Clicking the
  // caret toggles; the prompt text stays selectable.
  return (
    <div
      ref={drawerRef}
      style={{
        ...cardStyle,
        flexShrink: 0,
        ...(userHeight != null ? { height: userHeight } : { maxHeight: displayMaxHeight }),
        display: 'flex',
        flexDirection: 'row',
        gap: 6,
        position: 'relative',
      }}
    >
      <CaretDownIcon size={12} onClick={toggle} style={{ flexShrink: 0, cursor: 'pointer', marginTop: 3 }} />
      <div
        ref={textRef}
        style={{
          flex: 1,
          minWidth: 0,
          overflowY: 'auto',
          whiteSpace: 'pre-wrap',
          paddingRight: 24,
        }}
      >
        {prompt || 'No prompt entered'}
      </div>
      {prompt && (
        <div
          style={{
            position: 'absolute',
            top: 8,
            right: 10,
            height: '1.4em',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <CopyButton
            text={prompt}
            title="Copy prompt"
            style={{ padding: '0 4px', display: 'flex', alignItems: 'center' }}
          />
        </div>
      )}
      {(isOverflowing || userHeight != null) && (
        <div
          onPointerDown={onGripPointerDown}
          title="Drag to resize"
          aria-label="Drag to resize"
          style={{
            position: 'absolute',
            bottom: 2,
            right: 2,
            width: 14,
            height: 14,
            cursor: 'nwse-resize',
            color: 'var(--vscode-foreground)',
            opacity: 0.5,
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'flex-end',
          }}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <path d="M 10 2 L 2 10 M 10 5 L 5 10 M 10 8 L 8 10" stroke="currentColor" strokeWidth="1" fill="none" />
          </svg>
        </div>
      )}
    </div>
  );
}
