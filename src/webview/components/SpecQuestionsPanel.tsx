import { VscodeButton } from '@vscode-elements/react-elements';

import { type AgentStatus, agentStatusLabel, type SpecQuestionsPanelState } from '../../types/screens';
import { hasAnswer } from '../../utils/questionUtils';
import { postMessage } from '../useVSCodeMessaging';
import { QuestionItem } from './QuestionItem';
import { ScrollPanel } from './ScrollPanel';
import { StreamEndStatus } from './StreamEndStatus';
import { ToolCallGroup } from './ToolCallGroup';
import { ToolCallItem } from './ToolCallItem';

interface Props {
  // Undefined while the plan is still being written and no question panel exists yet.
  panel: SpecQuestionsPanelState | undefined;
  questionsAgent: AgentStatus;
  editorWorking: boolean;
  onSubmit?: () => void;
}

export function SpecQuestionsPanel({ panel, questionsAgent, editorWorking, onSubmit }: Props) {
  const rounds = panel?.rounds ?? [];
  const loading = panel?.loading ?? false;
  const toolCalls = panel?.toolCalls ?? [];

  const activeRound = [...rounds].reverse().find((r) => !r.frozen) ?? null;
  const hasAnswered = activeRound ? activeRound.questions.some((q) => hasAnswer(q)) : false;
  const noRounds = rounds.length === 0;
  const submitDisabled = !hasAnswered || editorWorking || loading || noRounds;
  // Allow refresh whenever the questions agent is fully idle and the editor isn't
  // mid-task. `phase === 'ready'` already excludes loading and queued regens.
  const refreshDisabled = editorWorking || questionsAgent.phase !== 'ready';
  // Show "no questions" only when the questions agent is fully idle and has produced
  // nothing — no active or frozen questions. `phase === 'ready'` is reachable only
  // after generation has settled (see computeQuestionsAgent priority list).
  const noQuestions = rounds.every((r) => r.questions.length === 0);
  const showEmptyState = questionsAgent.phase === 'ready' && noQuestions;

  const handleSubmit = () => {
    postMessage({ type: 'submitPanelAnswers' });
    onSubmit?.();
  };
  const handleRefresh = () => postMessage({ type: 'refreshPanelQuestions' });

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {showEmptyState ? (
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            fontSize: 12,
            opacity: 0.5,
            lineHeight: 1.4,
            padding: '24px 16px',
          }}
        >
          No questions to answer.
          <br />
          Click Refresh questions below to generate some.
        </div>
      ) : (
        <ScrollPanel
          style={{
            flex: 1,
            minHeight: 0,
            marginRight: -12,
            fontSize: 12,
            lineHeight: 1.5,
          }}
        >
          <div style={{ paddingTop: 8, paddingBottom: 8 }}>
            {rounds.map((round, ri) =>
              round.questions.map((q, qi) => {
                const isLast = ri === rounds.length - 1 && qi === round.questions.length - 1;
                const lineLabel = q.line != null && q.line >= 0 ? `Line ${q.line + 1}` : null;

                const sendUpdate = (textAnswer: string, chosenIndices: number[]) => {
                  postMessage({
                    type: 'answerPanelQuestion',
                    anchor: q.anchor,
                    textAnswer,
                    chosenIndices,
                  });
                };

                return (
                  <QuestionItem
                    key={`${ri}-${qi}`}
                    question={q}
                    frozen={round.frozen}
                    showBorder={!isLast}
                    lineLabel={lineLabel}
                    onAnswerChange={sendUpdate}
                    onJumpToLine={() => postMessage({ type: 'jumpToLine', anchor: q.anchor })}
                  />
                );
              }),
            )}

            {loading && toolCalls.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
                {toolCalls.length === 1 ? (
                  <ToolCallItem item={toolCalls[0]} />
                ) : (
                  <ToolCallGroup items={toolCalls} isLatest={true} />
                )}
              </div>
            )}
          </div>
        </ScrollPanel>
      )}

      <StreamEndStatus working={questionsAgent.working} text={agentStatusLabel(questionsAgent.phase)} />

      <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 4, paddingTop: 4 }}>
        <VscodeButton onClick={handleSubmit} disabled={submitDisabled} style={{ width: '100%' }}>
          Submit
        </VscodeButton>
        <div style={{ textAlign: 'center', padding: '2px 0' }}>
          <button
            onClick={handleRefresh}
            disabled={refreshDisabled}
            style={{
              background: 'none',
              border: 'none',
              cursor: refreshDisabled ? 'default' : 'pointer',
              color: refreshDisabled ? 'var(--vscode-disabledForeground)' : 'var(--vscode-descriptionForeground)',
              fontSize: 11,
              padding: 0,
              textDecoration: 'none',
            }}
          >
            Refresh questions
          </button>
        </div>
      </div>
    </div>
  );
}
