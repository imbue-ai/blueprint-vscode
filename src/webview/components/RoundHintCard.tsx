interface Props {
  visible: boolean;
}

export function RoundHintCard({ visible }: Props) {
  if (!visible) return null;

  return (
    <div
      style={{
        padding: '10px 12px',
        background: 'var(--vscode-textBlockQuote-background)',
        borderRadius: 4,
        fontSize: 12,
        lineHeight: 1.5,
      }}
    >
      <div style={{ opacity: 0.8 }}>
        Click <strong>Generate plan</strong> when ready, or <strong>Keep planning</strong> for follow-up questions. Each
        round of <strong>Keep planning</strong> asks increasingly specific questions. Stop when you think the details
        are covered.
      </div>
    </div>
  );
}
