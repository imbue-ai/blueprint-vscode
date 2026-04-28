import { useEffect, useRef, useState } from 'react';

import { postMessage } from '../useVSCodeMessaging';
import { DropdownTrigger } from './DropdownTrigger';

const MODELS = [
  { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6' },
  { id: 'claude-opus-4-6', label: 'Opus 4.6' },
];

interface Props {
  selected: string;
  hideLabel?: boolean;
}

export function ModelSelector({ selected, hideLabel }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    if (isOpen) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  const handleSelect = (model: string) => {
    postMessage({ type: 'setModel', model });
    setIsOpen(false);
  };

  const selectedLabel = MODELS.find((m) => m.id === selected)?.label ?? selected;

  return (
    <div>
      {!hideLabel && (
        <label
          style={{ fontSize: 12, color: 'var(--vscode-descriptionForeground)', marginBottom: 6, display: 'block' }}
        >
          Model
        </label>
      )}
      <div ref={containerRef} style={{ position: 'relative' }}>
        <DropdownTrigger onClick={() => setIsOpen((p) => !p)}>
          <span style={{ fontSize: 13, fontWeight: 500 }}>{selectedLabel}</span>
        </DropdownTrigger>

        {isOpen && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              marginTop: 2,
              background: 'var(--vscode-dropdown-background)',
              border: '1px solid var(--vscode-dropdown-border)',
              borderRadius: 4,
              padding: 4,
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
              zIndex: 10,
            }}
          >
            {MODELS.map((m) => (
              <div
                key={m.id}
                onClick={() => handleSelect(m.id)}
                style={{
                  padding: '6px 10px',
                  fontSize: 13,
                  cursor: 'pointer',
                  borderRadius: 3,
                  background: selected === m.id ? 'var(--vscode-list-activeSelectionBackground)' : 'transparent',
                }}
                onMouseEnter={(e) => {
                  if (selected !== m.id) e.currentTarget.style.background = 'var(--vscode-list-hoverBackground)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background =
                    selected === m.id ? 'var(--vscode-list-activeSelectionBackground)' : 'transparent';
                }}
              >
                {m.label}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
