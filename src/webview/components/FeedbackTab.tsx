import { TrashIcon } from '@phosphor-icons/react';
import { VscodeButton } from '@vscode-elements/react-elements';

import type { FeedbackItem } from '../../types/screens';
import { postMessage } from '../useVSCodeMessaging';
import { ScrollPanel } from './ScrollPanel';

interface FeedbackTabProps {
  feedbackItems: FeedbackItem[];
  nFeedback: number;
  isWorking: boolean;
  onSubmit: () => void;
}

export function FeedbackTab({ feedbackItems, nFeedback, isWorking, onSubmit }: FeedbackTabProps) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, paddingTop: 8 }}>
      <ScrollPanel style={{ flex: 1, minHeight: 0, marginRight: -12 }}>
        <div style={{ fontSize: 12 }}>
          <div style={{ fontSize: 12, opacity: 0.5, padding: '8px 0 16px', lineHeight: 1.4 }}>
            Click <strong>+</strong> next to line numbers to leave feedback for the agent about the plan.
          </div>
          {feedbackItems.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {feedbackItems.map((item) => (
                <FeedbackItemCard
                  key={item.id}
                  item={item}
                  onClick={() => postMessage({ type: 'jumpToLineNumber', line: item.startLine })}
                  onDelete={() => postMessage({ type: 'deleteFeedback', id: item.id })}
                />
              ))}
            </div>
          )}
        </div>
      </ScrollPanel>
      <VscodeButton
        onClick={() => {
          postMessage({ type: 'submitSpecFeedback' });
          onSubmit();
        }}
        disabled={nFeedback === 0 || isWorking}
        style={{ width: '100%', flexShrink: 0 }}
      >
        {nFeedback > 0 ? `Submit feedback (${nFeedback})` : 'Submit feedback'}
      </VscodeButton>
    </div>
  );
}

function FeedbackItemCard({
  item,
  onClick,
  onDelete,
}: {
  item: FeedbackItem;
  onClick: () => void;
  onDelete: () => void;
}) {
  const lineLabel =
    item.startLine === item.endLine ? `Line ${item.startLine}` : `Lines ${item.startLine}–${item.endLine}`;

  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        padding: '8px 10px',
        fontSize: 12,
        cursor: 'pointer',
        borderRadius: 4,
        border: '1px solid var(--vscode-panel-border)',
        background: 'var(--vscode-input-background)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--vscode-list-hoverBackground)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'var(--vscode-input-background)';
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 8 }}>
        <div style={{ fontWeight: 500 }}>{item.text}</div>
        <button
          title="Delete feedback"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 2,
            opacity: 0.5,
            flexShrink: 0,
            fontSize: 14,
            color: 'var(--vscode-foreground)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.opacity = '1';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = '0.5';
          }}
        >
          <TrashIcon size={12} />
        </button>
      </div>
      <div style={{ fontSize: 11, opacity: 0.5 }}>{lineLabel}</div>
    </div>
  );
}
