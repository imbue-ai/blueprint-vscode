import { CaretDownIcon, CaretRightIcon } from '@phosphor-icons/react';
import { useState } from 'react';

import type { StreamItem } from '../../types/screens';

type ToolCallData = Extract<StreamItem, { type: 'tool_call' }>;

interface Props {
  item: ToolCallData;
}

export function ToolCallItem({ item }: Props) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      style={{
        fontSize: 12,
        borderRadius: 4,
        backgroundColor: 'var(--vscode-input-background)',
      }}
    >
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 8px',
          cursor: 'pointer',
          userSelect: 'none',
          minWidth: 0,
        }}
      >
        {expanded ? (
          <CaretDownIcon size={12} style={{ flexShrink: 0, opacity: 0.6 }} />
        ) : (
          <CaretRightIcon size={12} style={{ flexShrink: 0, opacity: 0.6 }} />
        )}
        <span
          style={{
            fontFamily: 'var(--vscode-editor-font-family, monospace)',
            fontWeight: 600,
            flexShrink: 0,
          }}
        >
          {item.name}
        </span>
        {item.summary && (
          <span
            style={{ opacity: 0.6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}
          >
            {item.summary}
          </span>
        )}
      </div>
      {expanded && (
        <div
          style={{
            padding: '4px 8px 6px 26px',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          <div style={{ opacity: 0.7 }}>
            {Object.entries(item.args).map(([key, value]) => (
              <div
                key={key}
                style={{ fontFamily: 'var(--vscode-editor-font-family, monospace)', overflowWrap: 'break-word' }}
              >
                <span style={{ opacity: 0.7 }}>{key}:</span> {typeof value === 'string' ? value : JSON.stringify(value)}
              </div>
            ))}
          </div>
          {item.result && (
            <pre
              style={{
                margin: 0,
                padding: 6,
                backgroundColor: 'var(--vscode-editor-background)',
                borderRadius: 4,
                whiteSpace: 'pre-wrap',
                maxHeight: 200,
                overflowY: 'auto',
                fontSize: 12,
                opacity: 0.8,
              }}
            >
              {item.result}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
