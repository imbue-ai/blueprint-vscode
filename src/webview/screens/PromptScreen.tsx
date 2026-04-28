import { VscodeButton } from '@vscode-elements/react-elements';
import { useState } from 'react';

import type { AppScreen } from '../../types/screens';
import { BlueprintIcon } from '../components/BlueprintIcon';
import { Textarea } from '../components/InputComponents';
import { Tooltip } from '../components/Tooltip';
import { SUBMIT_SHORTCUT_LABEL } from '../platform';
import { useAutoGrowTextarea } from '../useAutoGrowTextarea';
import { postMessage } from '../useVSCodeMessaging';

type PromptScreenData = Extract<AppScreen, { type: 'prompt' }>;

interface Props {
  screen: PromptScreenData;
}

const MIN_HEIGHT = 200;
const MAX_HEIGHT = 300;

const TIPS = ['Tip: Adjust your plan template in Settings', 'Tip: Create and save multiple plan templates in Settings'];

export function PromptScreen({ screen }: Props) {
  const canSubmit = !!screen.prompt.trim();
  const taRef = useAutoGrowTextarea(screen.prompt, MIN_HEIGHT, MAX_HEIGHT);

  const [tip] = useState(() => TIPS[Math.floor(Math.random() * TIPS.length)]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && canSubmit) {
      e.preventDefault();
      postMessage({ type: 'submitSpecPrompt' });
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', boxSizing: 'border-box' }}>
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 18,
          padding: '12px',
          minHeight: 0,
          color: 'var(--vscode-descriptionForeground)',
        }}
      >
        <BlueprintIcon size={28} />
        <div style={{ fontSize: 12, textAlign: 'center', maxWidth: 300 }}>{tip}</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '0 12px 12px' }}>
        <Textarea
          ref={taRef}
          value={screen.prompt}
          onInput={(e) => postMessage({ type: 'setPrompt', prompt: (e.target as HTMLTextAreaElement).value })}
          onKeyDown={handleKeyDown}
          placeholder="Describe what you want to build"
          style={{ resize: 'none', width: '100%', boxSizing: 'border-box' }}
        />

        <Tooltip text={SUBMIT_SHORTCUT_LABEL} position="top" style={{ width: '100%' }}>
          <VscodeButton
            onClick={() => postMessage({ type: 'submitSpecPrompt' })}
            disabled={!canSubmit}
            style={{ width: '100%' }}
          >
            Submit
          </VscodeButton>
        </Tooltip>
      </div>
    </div>
  );
}
