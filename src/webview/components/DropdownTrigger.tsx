import { CaretDownIcon } from '@phosphor-icons/react';

import { INPUT_PADDING } from '../styles';

interface Props {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}

export function DropdownTrigger({ onClick, disabled, children }: Props) {
  return (
    <div
      onClick={() => !disabled && onClick()}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: INPUT_PADDING,
        height: 28,
        background: 'var(--vscode-dropdown-background)',
        border: '1px solid var(--vscode-dropdown-border)',
        borderRadius: 2,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        boxSizing: 'border-box',
      }}
    >
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>{children}</div>
      <CaretDownIcon size={12} style={{ flexShrink: 0, opacity: 0.6 }} />
    </div>
  );
}
