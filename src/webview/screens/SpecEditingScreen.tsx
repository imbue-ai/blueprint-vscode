import { CopyIcon } from '@phosphor-icons/react';
import { useCallback, useEffect, useState } from 'react';

import type { AppScreen } from '../../types/screens';
import { ActivityStream } from '../components/ActivityStream';
import { ChatInput } from '../components/ChatInput';
import { FeedbackTab } from '../components/FeedbackTab';
import { SpecQuestionsPanel } from '../components/SpecQuestionsPanel';
import { Tooltip } from '../components/Tooltip';
import { usePersistentState } from '../usePersistentState';

type SpecEditingScreenData = Extract<AppScreen, { type: 'specEditing' }>;
type SidebarSection = 'questions' | 'chat' | 'feedback';

interface Props {
  screen: SpecEditingScreenData;
}

export function SpecEditingScreen({ screen }: Props) {
  const editorWorking = screen.editorAgent.working;
  const hasPanel = !!screen.questionsPanel;
  const freshEntry = !!screen.freshEntry;
  const [storedSection, setStoredSection] = usePersistentState<SidebarSection>('specEditing.activeSection', 'chat');
  // TODO: also reset to 'chat' when screen.specFilePath changes within a single mount
  // (i.e., direct spec-to-spec switching without leaving the specEditing screen).
  // Today every new-spec entry routes through the prompt screen, so freshEntry already
  // covers it; revisit if a "switch spec in place" flow is added.
  const [activeSection, setActiveSectionLocal] = useState<SidebarSection>(() => (freshEntry ? 'chat' : storedSection));
  // On a fresh entry, also reset the persisted tab so a later remount restores 'chat'.
  useEffect(() => {
    if (freshEntry) setStoredSection('chat');
  }, [freshEntry, setStoredSection]);
  const setActiveSection = useCallback(
    (next: SidebarSection) => {
      setActiveSectionLocal(next);
      setStoredSection(next);
    },
    [setStoredSection],
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', boxSizing: 'border-box' }}>
      <div
        style={
          {
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            padding: '12px 12px 0 12px',
            minHeight: 0,
            '--vscode-font-size': '12px',
          } as React.CSSProperties
        }
      >
        {/* Horizontal tab bar */}
        <div
          style={{
            display: 'flex',
            flexShrink: 0,
            overflow: 'hidden',
            borderBottom: '1px solid var(--vscode-panel-border)',
          }}
        >
          <Tab title="Chat" active={activeSection === 'chat'} onClick={() => setActiveSection('chat')} />
          <Tab
            title="Questions"
            active={activeSection === 'questions'}
            onClick={() => setActiveSection('questions')}
            badge={hasPanel ? activeQuestionCount(screen) : undefined}
            // TODO: pulsing hides the badge, so if generation ever starts before the latest
            // round is frozen, a non-zero answerable count silently disappears behind the dot.
            // Today this is impossible only because panelQuestionHandlers freezes first;
            // enforce the invariant at the point loading/willRegenerate is set.
            pulsing={screen.questionsAgent.phase === 'generating_questions'}
          />
          <Tab
            title="Feedback"
            active={activeSection === 'feedback'}
            onClick={() => setActiveSection('feedback')}
            badge={screen.nFeedback > 0 ? screen.nFeedback : undefined}
          />
        </div>

        {/*
         * All three tabs are always mounted and toggled via `display` so that
         * each tab's scroll position and component state survives tab switches.
         * Unmounting would reset scrollTop and the ActivityStream refs.
         */}
        <div
          style={{
            flex: 1,
            display: activeSection === 'questions' ? 'flex' : 'none',
            flexDirection: 'column',
            minHeight: 0,
            paddingTop: 8,
          }}
        >
          <div style={{ fontSize: 12, opacity: 0.5, padding: '8px 0 16px', flexShrink: 0, lineHeight: 1.4 }}>
            Answer optional clarification questions about the plan.
          </div>
          <SpecQuestionsPanel
            panel={screen.questionsPanel}
            questionsAgent={screen.questionsAgent}
            editorWorking={editorWorking}
            onSubmit={() => setActiveSection('chat')}
          />
        </div>

        <div
          style={{
            flex: 1,
            display: activeSection === 'feedback' ? 'flex' : 'none',
            flexDirection: 'column',
            minHeight: 0,
          }}
        >
          <FeedbackTab
            feedbackItems={screen.feedbackItems}
            nFeedback={screen.nFeedback}
            isWorking={editorWorking}
            onSubmit={() => setActiveSection('chat')}
          />
        </div>

        <div
          style={{
            flex: 1,
            display: activeSection === 'chat' ? 'flex' : 'none',
            flexDirection: 'column',
            minHeight: 0,
          }}
        >
          <ActivityStream items={screen.streamItems} prompt={screen.prompt} agentStatus={screen.editorAgent} />
          <ChatInput draft={screen.messageDraft} disabled={editorWorking} />
        </div>

        <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 4, padding: '6px 0' }}>
          {screen.sessionId && <ResumeButton sessionId={screen.sessionId} />}
        </div>
      </div>
    </div>
  );
}

function Tab({
  title,
  active,
  onClick,
  badge,
  pulsing,
}: {
  title: string;
  active: boolean;
  onClick: () => void;
  badge?: number;
  // When true, replaces the badge with a small pulsing yellow dot — used to
  // signal in-flight work on a tab the user isn't currently viewing.
  pulsing?: boolean;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 12px',
        cursor: 'pointer',
        userSelect: 'none',
        fontWeight: 600,
        fontSize: 12,
        borderBottom: active ? '2px solid var(--vscode-focusBorder)' : '2px solid transparent',
        marginBottom: -1,
        color: active ? 'var(--vscode-foreground)' : 'var(--vscode-disabledForeground)',
        minWidth: 0,
        flexShrink: 1,
      }}
    >
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
      {pulsing ? (
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            backgroundColor: '#ffb300',
            boxShadow: '0 0 6px #ffb300',
            animation: 'pulse 1.5s ease-in-out infinite',
            flexShrink: 0,
          }}
        />
      ) : (
        badge !== undefined &&
        badge > 0 && (
          <span
            style={{
              background: 'var(--vscode-badge-background)',
              color: 'var(--vscode-badge-foreground)',
              borderRadius: 8,
              padding: '1px 6px',
              fontSize: 10,
              fontWeight: 600,
              flexShrink: 0,
            }}
          >
            {badge}
          </span>
        )
      )}
    </div>
  );
}

function ResumeButton({ sessionId }: { sessionId: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(`claude --resume ${sessionId}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Tooltip text="Implement the plan with the same agentic session" position="top" style={{ width: '100%' }}>
      <button
        onClick={handleCopy}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          width: '100%',
          background: 'none',
          border: '1px solid var(--vscode-panel-border)',
          borderRadius: 4,
          cursor: 'pointer',
          color: copied ? 'var(--vscode-terminal-ansiGreen)' : 'var(--vscode-foreground)',
          opacity: 0.7,
          padding: '4px 8px',
          fontSize: 11,
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.opacity = '1';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.opacity = '0.7';
        }}
      >
        <CopyIcon size={12} />
        {copied ? 'Copied!' : 'Copy resume command'}
      </button>
    </Tooltip>
  );
}

function activeQuestionCount(screen: SpecEditingScreenData): number {
  const rounds = screen.questionsPanel?.rounds ?? [];
  return rounds.filter((r) => !r.frozen).reduce((sum, r) => sum + r.questions.length, 0);
}
