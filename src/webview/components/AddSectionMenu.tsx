import { PlusIcon } from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';

import { PRESET_SECTIONS } from '../../types/onboarding';
import { postMessage } from '../useVSCodeMessaging';

interface Props {
  existingSectionTitles: string[];
}

export function AddSectionMenu({ existingSectionTitles }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    if (isOpen) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  const existingLower = new Set(existingSectionTitles.map((t) => t.toLowerCase()));

  const handleSelect = (presetKey: string | null) => {
    postMessage({ type: 'addTemplateSection', presetKey });
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setIsOpen((p) => !p)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          width: '100%',
          padding: '6px 10px',
          fontSize: 12,
          background: 'transparent',
          color: 'inherit',
          border: '1px solid var(--vscode-panel-border, rgba(128,128,128,0.5))',
          borderRadius: 3,
          cursor: 'pointer',
          opacity: 0.8,
        }}
      >
        <PlusIcon size={12} /> Add section
      </button>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            marginTop: 4,
            background: 'var(--vscode-dropdown-background)',
            border: '1px solid var(--vscode-dropdown-border)',
            borderRadius: 4,
            padding: 4,
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            zIndex: 10,
            minWidth: 180,
          }}
        >
          {PRESET_SECTIONS.map((p) => {
            const alreadyAdded = existingLower.has(p.title.toLowerCase());
            return (
              <div
                key={p.key}
                onClick={() => !alreadyAdded && handleSelect(p.key)}
                style={{
                  padding: '5px 8px',
                  fontSize: 12,
                  cursor: alreadyAdded ? 'default' : 'pointer',
                  borderRadius: 3,
                  opacity: alreadyAdded ? 0.4 : 1,
                }}
                onMouseEnter={(e) => {
                  if (!alreadyAdded) e.currentTarget.style.background = 'var(--vscode-list-hoverBackground)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                {p.title}
              </div>
            );
          })}
          <div
            style={{
              borderTop: '1px solid var(--vscode-panel-border, rgba(128,128,128,0.4))',
              margin: '4px 0',
            }}
          />
          <div
            onClick={() => handleSelect(null)}
            style={{
              padding: '5px 8px',
              fontSize: 12,
              cursor: 'pointer',
              borderRadius: 3,
              fontStyle: 'italic',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--vscode-list-hoverBackground)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
          >
            Custom...
          </div>
        </div>
      )}
    </div>
  );
}
