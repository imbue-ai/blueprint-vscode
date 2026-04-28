import { useState } from 'react';

import { postMessage } from '../useVSCodeMessaging';

interface Props {
  rawPrompt: string;
}

export function TemplateEditorRawMode({ rawPrompt }: Props) {
  const [draft, setDraft] = useState(rawPrompt);

  return (
    <div style={{ marginTop: 4, flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <p style={{ margin: '0 0 8px', fontSize: 12, opacity: 0.7, lineHeight: 1.5, flexShrink: 0 }}>
        Write the raw prompt that instructs the AI how to structure the plan.
      </p>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => postMessage({ type: 'setTemplateEditorRawPrompt', prompt: draft })}
        placeholder="The plan should contain EXACTLY the following sections..."
        style={{
          width: '100%',
          minHeight: 300,
          padding: '8px',
          fontSize: 12,
          fontFamily: 'var(--vscode-editor-font-family)',
          lineHeight: 1.5,
          background: 'var(--vscode-input-background)',
          color: 'var(--vscode-input-foreground)',
          border: '1px solid var(--vscode-input-border)',
          borderRadius: 2,
          outline: 'none',
          resize: 'vertical' as const,
          boxSizing: 'border-box' as const,
        }}
      />
    </div>
  );
}
