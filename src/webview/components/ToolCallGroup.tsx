import { CaretDownIcon, CaretRightIcon } from '@phosphor-icons/react';
import { useState } from 'react';

import type { StreamItem } from '../../types/screens';
import { ToolCallItem } from './ToolCallItem';

export type ToolCallData = Extract<StreamItem, { type: 'tool_call' }>;

interface Props {
  items: ToolCallData[];
  isLatest?: boolean;
}

export function ToolCallGroup({ items, isLatest }: Props) {
  const [expanded, setExpanded] = useState(false);

  if (isLatest && !expanded) {
    const recentItems = items.slice(-3);
    return (
      <div
        style={{
          fontSize: 12,
          borderRadius: 4,
          backgroundColor: 'var(--vscode-input-background)',
          padding: '6px 10px',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        {recentItems.map((item, i) => (
          <SoloToolCallLine key={i} item={item} />
        ))}
        {items.length > recentItems.length && (
          <div
            onClick={() => setExpanded(true)}
            style={{
              opacity: 0.5,
              fontSize: 12,
              cursor: 'pointer',
              userSelect: 'none',
              paddingTop: 2,
            }}
          >
            … {items.length - recentItems.length} more tools (click to expand)
          </div>
        )}
      </div>
    );
  }

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
        }}
      >
        {expanded ? (
          <CaretDownIcon size={12} style={{ flexShrink: 0, opacity: 0.6 }} />
        ) : (
          <CaretRightIcon size={12} style={{ flexShrink: 0, opacity: 0.6 }} />
        )}
        <span style={{ opacity: 0.7 }}>Called {items.length} tools</span>
      </div>
      {expanded && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '0 4px 4px' }}>
          {items.map((item, i) => (
            <ToolCallItem key={i} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

function SoloToolCallLine({ item }: { item: ToolCallData }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        minWidth: 0,
      }}
    >
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
        <span style={{ opacity: 0.6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
          {item.summary}
        </span>
      )}
    </div>
  );
}
