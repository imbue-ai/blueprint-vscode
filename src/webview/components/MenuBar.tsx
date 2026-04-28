import { SETTINGS_PADDING_X } from '../styles';

interface MenuBarProps {
  title?: string;
}

export function MenuBar({ title }: MenuBarProps) {
  if (!title) return null;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        flexShrink: 0,
        padding: `8px ${SETTINGS_PADDING_X}px`,
        borderBottom: '1px solid var(--vscode-panel-border)',
        marginBottom: 4,
        background: 'var(--vscode-sideBar-background)',
      }}
    >
      <span style={{ fontSize: 12, fontWeight: 600 }}>{title}</span>
    </div>
  );
}
