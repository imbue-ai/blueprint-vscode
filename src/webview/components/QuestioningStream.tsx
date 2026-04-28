import { Fragment, useEffect, useRef } from 'react';

import type { QuestioningMessage } from '../../types/questioningMessage';
import { groupQuestioningMessages, hasActiveQuestions, QuestioningMessageItem } from './QuestioningMessageItem';
import { RoundHintCard } from './RoundHintCard';
import { ScrollPanel } from './ScrollPanel';
import { ToolCallGroup } from './ToolCallGroup';
import { ToolCallItem } from './ToolCallItem';

interface Props {
  messages: QuestioningMessage[];
  streaming: boolean;
  roundStartIndex: number;
}

export function QuestioningStream({ messages, streaming, roundStartIndex }: Props) {
  const containerRef = useRef<HTMLElement>(null);
  const roundStartRef = useRef<HTMLDivElement>(null);
  const spacerRef = useRef<HTMLDivElement>(null);
  const prevRoundStartRef = useRef(-1);
  const needsScrollRef = useRef(false);
  const rafRef = useRef(0);

  // Size the spacer so the round start can scroll to the top, but no further.
  // When roundStartRef is unattached, preserve the previous spacer height —
  // collapsing to 0 causes the viewport to jump as scrollTop is clamped.
  const recalcSpacer = () => {
    if (!containerRef.current || !spacerRef.current) return;
    if (!roundStartRef.current) return;
    const roundStartTop = roundStartRef.current.offsetTop;
    if (roundStartTop === 0) {
      spacerRef.current.style.height = '0px';
      return;
    }
    const containerH = containerRef.current.clientHeight;
    const roundContentHeight = spacerRef.current.offsetTop - roundStartTop;
    spacerRef.current.style.height = `${Math.max(0, containerH - roundContentHeight)}px`;
  };

  // Recalculate spacer when container resizes
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => recalcSpacer());
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Recalculate spacer on content changes; scroll to round start on new rounds
  useEffect(() => {
    if (roundStartIndex !== prevRoundStartRef.current && messages.length > roundStartIndex) {
      prevRoundStartRef.current = roundStartIndex;
      needsScrollRef.current = true;
    }
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      recalcSpacer();
      if (needsScrollRef.current && roundStartRef.current && containerRef.current) {
        const target = roundStartRef.current.offsetTop;
        // roundStartIndex can change twice per transition (first to a stale
        // value where offsetTop=0, then to the correct one). Skip the stale
        // scroll and let the next effect retry with the right position.
        if (target > 0) {
          needsScrollRef.current = false;
          containerRef.current.scrollTo({ top: target, behavior: 'smooth' });
        }
      }
    });
  }, [roundStartIndex, messages]);

  const groups = groupQuestioningMessages(messages);

  // Map flat roundStartIndex to the group that contains it
  let roundStartGroupIdx = -1;
  let cursor = 0;
  for (let g = 0; g < groups.length; g++) {
    const grp = groups[g];
    const size = grp.type === 'tool_calls' ? grp.items.length : 1;
    if (cursor + size > roundStartIndex) {
      roundStartGroupIdx = g;
      break;
    }
    cursor += size;
  }

  return (
    <ScrollPanel
      scrollRef={containerRef}
      style={{
        flex: 1,
        minHeight: 0,
        marginRight: -12,
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          fontSize: 12,
          lineHeight: 1.5,
        }}
      >
        {groups.map((group, i, allGroups) => {
          const isRoundStart = i === roundStartGroupIdx;

          if (group.type === 'tool_calls') {
            const isLatest = i === allGroups.length - 1;
            const el =
              group.items.length === 1 && !isLatest ? (
                <ToolCallItem item={group.items[0]} />
              ) : (
                <ToolCallGroup items={group.items} isLatest={isLatest} />
              );
            return isRoundStart ? (
              <div key={i} ref={roundStartRef}>
                {el}
              </div>
            ) : (
              <Fragment key={i}>{el}</Fragment>
            );
          }

          const el = (
            <QuestioningMessageItem
              message={group.message}
              isFirstQuestion={group.isFirstQuestion}
              isLastFrozenQuestion={group.isLastFrozenQuestion}
            />
          );
          return isRoundStart ? (
            <div key={i} ref={roundStartRef}>
              {el}
            </div>
          ) : (
            <Fragment key={i}>{el}</Fragment>
          );
        })}
        <RoundHintCard visible={!streaming && hasActiveQuestions(messages)} />
        <div ref={spacerRef} style={{ flexShrink: 0 }} />
      </div>
    </ScrollPanel>
  );
}
