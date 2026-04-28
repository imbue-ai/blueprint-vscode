import { CheckIcon, PencilSimpleIcon, TrashIcon } from '@phosphor-icons/react';
import { useState } from 'react';

import type { PromptTemplate } from '../../types/promptTemplate';
import { postMessage } from '../useVSCodeMessaging';
import { Tooltip } from './Tooltip';

interface Props {
  template: PromptTemplate;
  canDelete: boolean;
  isLast: boolean;
  isSelected: boolean;
}

export function TemplateListItem({ template, canDelete, isLast, isSelected }: Props) {
  const [isHovered, setIsHovered] = useState(false);

  const iconBtnStyle = (disabled: boolean): React.CSSProperties => ({
    width: 22,
    height: 22,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'transparent',
    border: 'none',
    borderRadius: 3,
    color: 'inherit',
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.25 : 0.6,
    flexShrink: 0,
    padding: 0,
  });

  const handleSelect = () => {
    if (!isSelected) postMessage({ type: 'setSpecTemplate', id: template.id });
  };

  const background = isSelected
    ? 'var(--vscode-list-activeSelectionBackground)'
    : isHovered
      ? 'var(--vscode-list-hoverBackground)'
      : 'transparent';

  return (
    <div
      onClick={handleSelect}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      role="option"
      aria-selected={isSelected}
      tabIndex={isSelected ? 0 : -1}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleSelect();
          return;
        }
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Home' || e.key === 'End') {
          e.preventDefault();
          const items = e.currentTarget.parentElement?.querySelectorAll<HTMLElement>('[role="option"]');
          if (!items || items.length === 0) return;
          const idx = Array.from(items).indexOf(e.currentTarget);
          let next = idx;
          if (e.key === 'ArrowDown') next = Math.min(idx + 1, items.length - 1);
          else if (e.key === 'ArrowUp') next = Math.max(idx - 1, 0);
          else if (e.key === 'Home') next = 0;
          else if (e.key === 'End') next = items.length - 1;
          items[next].focus();
        }
      }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '5px 8px',
        background,
        borderBottom: isLast ? 'none' : '1px solid var(--vscode-panel-border, rgba(128,128,128,0.2))',
        cursor: isSelected ? 'default' : 'pointer',
      }}
    >
      <div
        style={{
          width: 14,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: isSelected ? 1 : 0,
        }}
        aria-hidden
      >
        <CheckIcon size={12} />
      </div>
      <div
        style={{
          flex: 1,
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          fontSize: 13,
        }}
      >
        {template.name}
      </div>
      <span
        style={{
          fontSize: 11,
          color: 'var(--vscode-descriptionForeground)',
          whiteSpace: 'nowrap',
          flexShrink: 0,
          fontFamily: 'var(--vscode-editor-font-family)',
          opacity: 0.8,
        }}
      >
        {template.filename}
      </span>
      <Tooltip text="Edit template">
        <button
          onClick={(e) => {
            e.stopPropagation();
            postMessage({ type: 'openTemplateEditor', templateId: template.id });
          }}
          aria-label="Edit template"
          style={iconBtnStyle(false)}
        >
          <PencilSimpleIcon size={13} />
        </button>
      </Tooltip>
      <Tooltip text={canDelete ? 'Delete template' : 'Cannot delete the only template'}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (canDelete) postMessage({ type: 'deleteTemplate', templateId: template.id });
          }}
          aria-label="Delete template"
          style={iconBtnStyle(!canDelete)}
        >
          <TrashIcon size={13} />
        </button>
      </Tooltip>
    </div>
  );
}
