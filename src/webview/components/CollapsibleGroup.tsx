import { CaretDownIcon, CaretRightIcon } from '@phosphor-icons/react';
import { useState } from 'react';

interface Props {
  question: string;
  description: string;
  isError?: boolean;
  children: React.ReactNode;
}

export function CollapsibleGroup({ question, description, isError, children }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ border: '1px solid var(--vscode-panel-border, rgba(128,128,128,0.4))', borderRadius: 4 }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 8,
          width: '100%',
          padding: '12px 14px',
          cursor: 'pointer',
          textAlign: 'left',
          background: 'var(--vscode-sideBarSectionHeader-background, rgba(128,128,128,0.1))',
          border: 'none',
          color: 'inherit',
          fontFamily: 'inherit',
          borderRadius: open ? '4px 4px 0 0' : '4px',
        }}
      >
        <div style={{ flexShrink: 0, marginTop: 2, opacity: 0.6 }}>
          {open ? <CaretDownIcon size={12} /> : <CaretRightIcon size={12} />}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{question}</div>
          <div
            style={{
              fontSize: 12,
              marginTop: 3,
              opacity: isError ? 1 : 0.7,
              color: isError ? 'var(--vscode-errorForeground)' : 'inherit',
            }}
          >
            {description}
          </div>
        </div>
      </button>
      {open && (
        <div
          style={{ padding: '8px 12px 12px', borderTop: '1px solid var(--vscode-panel-border, rgba(128,128,128,0.4))' }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
