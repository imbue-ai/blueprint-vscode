import { VscodeButton } from '@vscode-elements/react-elements';
import { useEffect, useState } from 'react';

interface Props {
  resetsAt: number;
  onDismiss: () => void;
}

function formatTimeRemaining(resetsAt: number): string {
  const diffSec = Math.max(0, resetsAt - Math.floor(Date.now() / 1000));
  if (diffSec === 0) return 'now';
  const minutes = Math.ceil(diffSec / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMin = minutes % 60;
  return remainingMin > 0 ? `${hours}h ${remainingMin}m` : `${hours}h`;
}

export function RateLimitBanner({ resetsAt, onDismiss }: Props) {
  const [timeLeft, setTimeLeft] = useState(() => formatTimeRemaining(resetsAt));

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft(formatTimeRemaining(resetsAt));
    }, 30_000);
    return () => clearInterval(interval);
  }, [resetsAt]);

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.4)',
        zIndex: 100,
      }}
    >
      <div
        style={{
          background: 'var(--vscode-editor-background)',
          border: '1px solid var(--vscode-panel-border)',
          borderRadius: 6,
          padding: '20px 24px',
          textAlign: 'center',
          maxWidth: 260,
        }}
      >
        <p style={{ fontSize: 14, fontWeight: 600, margin: '0 0 6px' }}>Rate limited</p>
        <p style={{ fontSize: 12, opacity: 0.7, margin: '0 0 16px' }}>Resets in {timeLeft}</p>
        <VscodeButton onClick={onDismiss} style={{ width: '100%' }}>
          Dismiss
        </VscodeButton>
      </div>
    </div>
  );
}
