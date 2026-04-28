interface Props {
  working: boolean;
  text: string;
}

export function StreamEndStatus({ working, text }: Props) {
  const dotColor = working ? '#ffb300' : '#4caf50';
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 2px',
        flexShrink: 0,
        fontSize: 12,
        color: working ? 'var(--vscode-foreground)' : 'var(--vscode-descriptionForeground)',
      }}
    >
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          backgroundColor: dotColor,
          boxShadow: working ? `0 0 6px ${dotColor}` : 'none',
          animation: working ? 'pulse 1.5s ease-in-out infinite' : 'none',
          flexShrink: 0,
        }}
      />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{text}</span>
    </div>
  );
}
