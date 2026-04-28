import { VscodeButton } from '@vscode-elements/react-elements';

import { agentStatusLabel, type AppScreen } from '../../types/screens';
import { hasAnswer } from '../../utils/questionUtils';
import { PromptDrawer } from '../components/PromptDrawer';
import { QuestioningStream } from '../components/QuestioningStream';
import { StreamEndStatus } from '../components/StreamEndStatus';
import { Tooltip } from '../components/Tooltip';
import { postMessage } from '../useVSCodeMessaging';

type PromptRefinementScreenData = Extract<AppScreen, { type: 'promptRefinement' }>;

interface Props {
  screen: PromptRefinementScreenData;
}

export function PromptRefinementScreen({ screen }: Props) {
  const hasAnswers = screen.questions.some((q) => hasAnswer(q));
  const firstRoundLoading = screen.isFirstRound && screen.questionsLoading;
  const refineDisabled = screen.questionsLoading || screen.refining || !hasAnswers;
  const generateDisabled = firstRoundLoading;

  // Between-rounds hold: while a previous round's content exists and the new
  // round hasn't produced any content yet, keep showing 'updating_prompt' even
  // after the backend has already flipped phase to 'generating_questions'. This
  // lines up the text change with the scroll-to-new-round animation.
  const inBetweenRounds =
    screen.agentStatus.working &&
    screen.agentStatus.phase === 'generating_questions' &&
    screen.questioningMessages.length > 0 &&
    screen.questioningMessages.length <= screen.roundStartIndex;
  const displayPhase = inBetweenRounds ? 'updating_prompt' : screen.agentStatus.phase;

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', height: '100%', boxSizing: 'border-box', overflow: 'hidden' }}
    >
      <div
        style={
          {
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            gap: 12,
            padding: '12px 12px',
            minHeight: 0,
            '--vscode-font-size': '12px',
          } as React.CSSProperties
        }
      >
        <PromptDrawer prompt={screen.currentPrompt} refining={screen.refining} />

        <QuestioningStream
          messages={screen.questioningMessages}
          streaming={screen.questionsLoading}
          roundStartIndex={screen.roundStartIndex}
        />

        <StreamEndStatus working={screen.agentStatus.working} text={agentStatusLabel(displayPhase)} />

        <div style={{ display: 'flex', gap: 8, flexShrink: 0, paddingTop: 4 }}>
          <Tooltip
            text="Incorporate your answers into the prompt and ask new questions"
            position="top"
            style={{ flex: 1, minWidth: 0 }}
          >
            <VscodeButton
              onClick={() => postMessage({ type: 'refinePrompt' })}
              disabled={refineDisabled}
              style={{ width: '100%' }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                Keep planning
              </span>
            </VscodeButton>
          </Tooltip>
          <Tooltip
            text="Start writing the plan using the current prompt"
            position="top"
            style={{ flex: 1, minWidth: 0 }}
          >
            <VscodeButton
              onClick={() => postMessage({ type: 'generateSpec' })}
              disabled={generateDisabled}
              style={{ width: '100%' }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                Generate plan
              </span>
            </VscodeButton>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}
