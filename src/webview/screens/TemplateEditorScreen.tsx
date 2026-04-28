import { VscodeButton } from '@vscode-elements/react-elements';

import type { AppScreen, TemplateEditorMode } from '../../types/screens';
import { CollapsibleGroup } from '../components/CollapsibleGroup';
import { ScrollPanel } from '../components/ScrollPanel';
import {
  ContentGroupBody,
  getSectionDescription,
  getStyleDescription,
  StyleGroupBody,
} from '../components/TemplateFormFields';
import { postMessage } from '../useVSCodeMessaging';
import { TemplateEditorNameFields } from './TemplateEditorNameFields';
import { TemplateEditorRawMode } from './TemplateEditorRawMode';

type TemplateEditorScreenData = Extract<AppScreen, { type: 'templateEditor' }>;

interface Props {
  screen: TemplateEditorScreenData;
}

export function TemplateEditorScreen({ screen }: Props) {
  const { name, filename, mode, data, rawPrompt, isCreate } = screen;
  const hasSections = data.sections.length > 0;
  const sectionDesc = getSectionDescription(data.sections);
  const canSave =
    !!name.trim() && !!filename.trim() && /\.md$/i.test(filename.trim()) && (mode === 'freeform' || hasSections);

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', height: '100%', boxSizing: 'border-box', overflow: 'hidden' }}
    >
      <ScrollPanel
        style={{ flex: 1, minHeight: 0, paddingLeft: 12, '--vscode-font-size': '12px' } as React.CSSProperties}
      >
        <div style={{ paddingTop: 12 }}>
          <div style={{ marginBottom: 8 }}>
            <h2 style={{ margin: 0, fontSize: 16 }}>{isCreate ? 'New template' : 'Edit template'}</h2>
          </div>
          <TemplateEditorNameFields name={name} filename={filename} />
          <ModeToggle mode={mode} />
        </div>
        {mode === 'structured' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <CollapsibleGroup
              question="What sections should the plan include?"
              description={sectionDesc.text}
              isError={sectionDesc.isError}
            >
              <ContentGroupBody data={data} />
            </CollapsibleGroup>
            <CollapsibleGroup
              question="What writing style do you prefer?"
              description={getStyleDescription(data.styles, data.depth)}
            >
              <StyleGroupBody data={data} />
            </CollapsibleGroup>
          </div>
        ) : (
          <TemplateEditorRawMode rawPrompt={rawPrompt} />
        )}

        <div style={{ marginTop: 12, marginBottom: 12, flexShrink: 0 }}>
          <VscodeButton
            onClick={() => postMessage({ type: 'saveTemplateEditor' })}
            disabled={!canSave}
            style={{ width: '100%' }}
          >
            {isCreate ? 'Create template' : 'Save template'}
          </VscodeButton>
        </div>
      </ScrollPanel>
    </div>
  );
}

function ModeToggle({ mode }: { mode: TemplateEditorMode }) {
  const modes: { value: TemplateEditorMode; label: string }[] = [
    { value: 'structured', label: 'Structured' },
    { value: 'freeform', label: 'Freeform' },
  ];
  return (
    <div style={{ display: 'flex', gap: 0, marginBottom: 12, borderRadius: 4, overflow: 'hidden' }}>
      {modes.map((m) => (
        <button
          key={m.value}
          onClick={() => postMessage({ type: 'setTemplateEditorMode', mode: m.value })}
          style={{
            flex: 1,
            padding: '5px 0',
            fontSize: 12,
            border: '1px solid var(--vscode-panel-border, rgba(128,128,128,0.4))',
            background: mode === m.value ? 'var(--vscode-list-activeSelectionBackground)' : 'transparent',
            color: mode === m.value ? 'var(--vscode-list-activeSelectionForeground)' : 'inherit',
            cursor: 'pointer',
          }}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
