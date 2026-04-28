import { CopyIcon } from '@phosphor-icons/react';

interface Props {
  text: string;
  title?: string;
  iconSize?: number;
  style?: React.CSSProperties;
}

export function CopyButton({ text, title = 'Copy', iconSize = 14, style }: Props) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(text);
      }}
      title={title}
      style={{
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        color: 'var(--vscode-foreground)',
        opacity: 0.5,
        padding: 4,
        borderRadius: 4,
        ...style,
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.opacity = '1';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.opacity = '0.5';
      }}
    >
      <CopyIcon size={iconSize} />
    </button>
  );
}
