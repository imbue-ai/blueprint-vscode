import { ArrowDownIcon, ArrowUpIcon, TrashIcon } from '@phosphor-icons/react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import type { SpecSection } from '../../types/onboarding';
import { postMessage } from '../useVSCodeMessaging';
import { Tooltip } from './Tooltip';

interface Props {
  section: SpecSection;
  index: number;
  total: number;
  siblingTitles: string[];
}

const DESC_MAX_HEIGHT = 150;

export function SectionItem({ section, index, total, siblingTitles }: Props) {
  const [titleFocused, setTitleFocused] = useState(false);
  const [descFocused, setDescFocused] = useState(false);
  const [titleDraft, setTitleDraft] = useState(section.title);
  const [descDraft, setDescDraft] = useState(section.description);
  const titleRef = useRef<HTMLInputElement>(null);
  const descRef = useRef<HTMLTextAreaElement>(null);
  const isNew = !section.title.trim() && !section.description.trim();

  // Auto-size the description textarea to fit its content, capped at DESC_MAX_HEIGHT.
  // Re-runs on container width changes so wrap behavior stays in sync with the actual layout.
  useLayoutEffect(() => {
    const ta = descRef.current;
    if (!ta) return;
    const resize = () => {
      ta.style.height = 'auto';
      // scrollHeight excludes border, but we use box-sizing: border-box, so add border back.
      const styles = getComputedStyle(ta);
      const borderY = parseFloat(styles.borderTopWidth) + parseFloat(styles.borderBottomWidth);
      const next = Math.min(ta.scrollHeight + borderY, DESC_MAX_HEIGHT);
      ta.style.height = `${next}px`;
    };
    resize();
    let lastWidth = ta.clientWidth;
    const ro = new ResizeObserver(() => {
      if (ta.clientWidth !== lastWidth) {
        lastWidth = ta.clientWidth;
        resize();
      }
    });
    ro.observe(ta);
    return () => ro.disconnect();
  }, [descDraft]);

  // Auto-focus title input for newly added sections
  useEffect(() => {
    if (isNew) titleRef.current?.focus();
  }, []);

  // Sync drafts when props change (e.g. after reorder)
  useEffect(() => {
    if (!titleFocused) setTitleDraft(section.title);
  }, [section.title, titleFocused]);
  useEffect(() => {
    if (!descFocused) setDescDraft(section.description);
  }, [section.description, descFocused]);

  const commitTitle = () => {
    setTitleFocused(false);
    const trimmed = titleDraft.trim();
    const isDuplicate = siblingTitles.some((t) => t.trim().toLowerCase() === trimmed.toLowerCase());
    if (isDuplicate) {
      setTitleDraft(section.title);
      return;
    }
    if (titleDraft !== section.title) {
      postMessage({
        type: 'updateTemplateSection',
        sectionId: section.id,
        title: titleDraft,
        description: section.description,
      });
    }
  };

  const commitDesc = () => {
    setDescFocused(false);
    if (descDraft !== section.description) {
      postMessage({
        type: 'updateTemplateSection',
        sectionId: section.id,
        title: section.title,
        description: descDraft,
      });
    }
  };

  return (
    <div
      style={{
        border: '1px solid var(--vscode-panel-border, rgba(128,128,128,0.4))',
        borderRadius: 4,
        padding: '8px 10px',
        background: 'var(--vscode-input-background)',
        position: 'relative',
      }}
    >
      {/* Reorder + delete buttons */}
      <div
        style={{
          position: 'absolute',
          top: 6,
          right: 6,
          display: 'flex',
          flexDirection: 'row',
          gap: 2,
        }}
      >
        <IconBtn
          title="Move up"
          disabled={index === 0}
          onClick={() => postMessage({ type: 'moveTemplateSection', sectionId: section.id, direction: 'up' })}
        >
          <ArrowUpIcon size={12} />
        </IconBtn>
        <IconBtn
          title="Move down"
          disabled={index === total - 1}
          onClick={() => postMessage({ type: 'moveTemplateSection', sectionId: section.id, direction: 'down' })}
        >
          <ArrowDownIcon size={12} />
        </IconBtn>
        <IconBtn title="Remove" onClick={() => postMessage({ type: 'removeTemplateSection', sectionId: section.id })}>
          <TrashIcon size={12} />
        </IconBtn>
      </div>

      {/* Content */}
      <div style={{ minWidth: 0, paddingRight: 70 }}>
        <input
          ref={titleRef}
          value={titleDraft}
          onChange={(e) => setTitleDraft(e.target.value)}
          onFocus={() => setTitleFocused(true)}
          onBlur={commitTitle}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          placeholder="Section title"
          style={{
            width: '100%',
            fontSize: 13,
            fontWeight: 600,
            padding: '2px 4px',
            background: titleFocused ? 'var(--vscode-input-background)' : 'transparent',
            color: 'var(--vscode-input-foreground)',
            border: titleFocused ? '1px solid var(--vscode-input-border)' : '1px solid transparent',
            borderRadius: 2,
            outline: 'none',
            boxSizing: 'border-box',
            cursor: 'text',
          }}
        />

        <textarea
          ref={descRef}
          rows={1}
          value={descDraft}
          onChange={(e) => setDescDraft(e.target.value)}
          onFocus={() => setDescFocused(true)}
          onBlur={commitDesc}
          placeholder="Section description (what should this section contain?)"
          style={{
            width: '100%',
            fontSize: 12,
            padding: '4px',
            marginTop: 4,
            maxHeight: DESC_MAX_HEIGHT,
            background: descFocused ? 'var(--vscode-input-background)' : 'transparent',
            color: 'var(--vscode-input-foreground)',
            opacity: descFocused || descDraft ? 1 : 0.5,
            border: descFocused ? '1px solid var(--vscode-input-border)' : '1px solid transparent',
            borderRadius: 2,
            outline: 'none',
            resize: 'none',
            overflow: 'auto',
            boxSizing: 'border-box',
            fontFamily: 'inherit',
            lineHeight: 1.4,
            cursor: 'text',
          }}
        />
      </div>
    </div>
  );
}

function IconBtn({
  title,
  disabled,
  onClick,
  children,
}: {
  title: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip text={title}>
      <button
        aria-label={title}
        disabled={disabled}
        onClick={onClick}
        style={{
          width: 20,
          height: 20,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'transparent',
          border: 'none',
          borderRadius: 3,
          color: 'inherit',
          cursor: disabled ? 'default' : 'pointer',
          opacity: disabled ? 0.3 : 0.7,
          padding: 0,
        }}
      >
        {children}
      </button>
    </Tooltip>
  );
}
