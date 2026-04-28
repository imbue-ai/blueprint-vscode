import { VscodeButton } from '@vscode-elements/react-elements';

import { SUBMIT_SHORTCUT_LABEL } from '../platform';
import { useAutoGrowTextarea } from '../useAutoGrowTextarea';
import { postMessage } from '../useVSCodeMessaging';
import { Textarea } from './InputComponents';
import { Tooltip } from './Tooltip';

interface Props {
  draft: string;
  disabled: boolean;
}

const MIN_HEIGHT = 70;
const MAX_HEIGHT = 150;

export function ChatInput({ draft, disabled }: Props) {
  const canSend = draft.trim().length > 0 && !disabled;
  const taRef = useAutoGrowTextarea(draft, MIN_HEIGHT, MAX_HEIGHT);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      if (canSend) postMessage({ type: 'sendMessage' });
      e.preventDefault();
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        paddingTop: 8,
      }}
    >
      <Textarea
        ref={taRef}
        value={draft}
        onInput={(e) => postMessage({ type: 'setDraftMessage', message: (e.target as HTMLTextAreaElement).value })}
        onKeyDown={handleKeyDown}
        placeholder="Ask a question or request changes"
        style={{ resize: 'none', width: '100%', boxSizing: 'border-box' }}
      />
      <Tooltip text={SUBMIT_SHORTCUT_LABEL} position="top" style={{ width: '100%', flexShrink: 0 }}>
        <VscodeButton
          onClick={() => {
            if (canSend) postMessage({ type: 'sendMessage' });
          }}
          disabled={!canSend}
          style={{ width: '100%' }}
        >
          Send message
        </VscodeButton>
      </Tooltip>
    </div>
  );
}
