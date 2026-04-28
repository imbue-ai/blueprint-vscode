import { Fragment, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';

import { type AgentStatus, agentStatusLabel, type StreamItem } from '../../types/screens';
import { CopyButton } from './CopyButton';
import { ScrollPanel } from './ScrollPanel';
import { StreamEndStatus } from './StreamEndStatus';
import { type ToolCallData, ToolCallGroup } from './ToolCallGroup';
import { ToolCallItem } from './ToolCallItem';

interface Props {
  items: StreamItem[];
  prompt?: string;
  agentStatus?: AgentStatus;
}

export function ActivityStream({ items, prompt, agentStatus }: Props) {
  const containerRef = useRef<HTMLElement>(null);
  const userMsgRef = useRef<HTMLDivElement>(null);
  const spacerRef = useRef<HTMLDivElement>(null);
  const needsScrollRef = useRef(false);
  const rafRef = useRef(0);

  // Find the flat index of the last user message
  let lastUserMsgIdx = -1;
  for (let i = items.length - 1; i >= 0; i--) {
    if (items[i].type === 'user_message') {
      lastUserMsgIdx = i;
      break;
    }
  }

  // Seed with the current last user message so a fresh mount (e.g. tab switch
  // away and back) doesn't treat the existing last-user-message as "new" and
  // re-run the scroll animation. The ref initializer only fires once per mount.
  const prevUserMsgIdxRef = useRef(lastUserMsgIdx);

  // Size the spacer so the last user message can scroll to the top, but no further.
  // Skip while the container is hidden (clientHeight === 0, e.g. this tab isn't
  // the active section) — otherwise the spacer would collapse to 0, reducing
  // scrollHeight and causing the browser to clamp scrollTop down when the tab
  // is shown again.
  const recalcSpacer = () => {
    if (!containerRef.current || !spacerRef.current) return;
    const containerH = containerRef.current.clientHeight;
    if (containerH === 0) return;
    if (!userMsgRef.current) {
      spacerRef.current.style.height = '0px';
      return;
    }
    const contentHeight = spacerRef.current.offsetTop - userMsgRef.current.offsetTop;
    spacerRef.current.style.height = `${Math.max(0, containerH - contentHeight)}px`;
  };

  // Recalculate spacer when container resizes
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => recalcSpacer());
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Recalculate spacer on content changes; scroll to last user message when a new one appears
  useEffect(() => {
    if (lastUserMsgIdx >= 0 && lastUserMsgIdx !== prevUserMsgIdxRef.current) {
      prevUserMsgIdxRef.current = lastUserMsgIdx;
      needsScrollRef.current = true;
    }
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      recalcSpacer();
      if (needsScrollRef.current && userMsgRef.current && containerRef.current) {
        needsScrollRef.current = false;
        containerRef.current.scrollTo({ top: userMsgRef.current.offsetTop, behavior: 'smooth' });
      }
    });
    // NOTE: lastUserMsgIdx is derived from items, so this effect runs twice per items change.
    // The cancelAnimationFrame above dedupes the actual work, so it's cosmetic — leaving as-is
    // because this scroll behavior was hard to get right; revisit before changing the deps.
  }, [lastUserMsgIdx, items]);

  const groups = groupStreamItems(items);

  // Map flat lastUserMsgIdx to the group that contains it
  let targetGroupIdx = -1;
  if (lastUserMsgIdx >= 0) {
    let cursor = 0;
    for (let g = 0; g < groups.length; g++) {
      const grp = groups[g];
      const size = grp.type === 'tool_calls' ? grp.items.length : 1;
      if (cursor + size > lastUserMsgIdx) {
        targetGroupIdx = g;
        break;
      }
      cursor += size;
    }
  }

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
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
            paddingTop: 8,
            fontSize: 12,
            lineHeight: 1.5,
          }}
        >
          {prompt && <PromptBubble content={prompt} />}
          {groups.map((group, i, allGroups) => {
            const isTarget = i === targetGroupIdx;

            if (group.type === 'tool_calls') {
              const isLatest = i === allGroups.length - 1;
              const el =
                group.items.length === 1 && !isLatest ? (
                  <ToolCallItem item={group.items[0]} />
                ) : (
                  <ToolCallGroup items={group.items} isLatest={isLatest} />
                );
              return <Fragment key={i}>{el}</Fragment>;
            }

            const el =
              group.item.type === 'user_message' ? (
                <MessageBubble role="user" content={group.item.content} />
              ) : (
                <MessageBubble role="assistant" content={group.item.content} />
              );
            return isTarget ? (
              <div key={i} ref={userMsgRef}>
                {el}
              </div>
            ) : (
              <Fragment key={i}>{el}</Fragment>
            );
          })}
          <div ref={spacerRef} style={{ flexShrink: 0 }} />
        </div>
      </ScrollPanel>
      {agentStatus && <StreamEndStatus working={agentStatus.working} text={agentStatusLabel(agentStatus.phase)} />}
    </div>
  );
}

type StreamGroup =
  | { type: 'tool_calls'; items: ToolCallData[] }
  | { type: 'message'; item: Extract<StreamItem, { type: 'user_message' | 'assistant_message' }> };

function groupStreamItems(items: StreamItem[]): StreamGroup[] {
  const groups: StreamGroup[] = [];
  for (const item of items) {
    if (item.type === 'tool_call') {
      const last = groups[groups.length - 1];
      if (last?.type === 'tool_calls') {
        last.items.push(item);
      } else {
        groups.push({ type: 'tool_calls', items: [item] });
      }
    } else {
      groups.push({ type: 'message', item });
    }
  }
  return groups;
}

function PromptBubble({ content }: { content: string }) {
  return (
    <div style={{ position: 'relative' }}>
      <CopyButton text={content} title="Copy prompt" style={{ position: 'absolute', top: 8, right: 8 }} />
      <div
        style={{
          padding: 10,
          backgroundColor: 'var(--vscode-editor-background)',
          borderRadius: 4,
          border: '1px solid var(--vscode-panel-border)',
          fontSize: 12,
          lineHeight: 1.4,
          whiteSpace: 'pre-wrap',
        }}
      >
        {content}
      </div>
    </div>
  );
}

function MessageBubble({ role, content }: { role: 'user' | 'assistant'; content: string }) {
  return (
    <div
      style={{
        padding: 8,
        borderRadius: 4,
        backgroundColor: 'var(--vscode-input-background)',
        wordBreak: 'break-word',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      <div style={{ fontSize: 11, opacity: 0.6, textTransform: 'uppercase' }}>
        {role === 'user' ? 'You' : 'Assistant'}
      </div>
      <div className="markdown-content">
        <ReactMarkdown>{content}</ReactMarkdown>
      </div>
    </div>
  );
}
