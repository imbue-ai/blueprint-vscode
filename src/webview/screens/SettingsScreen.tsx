import { PlusIcon } from '@phosphor-icons/react';

import type { AppScreen } from '../../types/screens';
import { MenuBar } from '../components/MenuBar';
import { ModelSelector } from '../components/ModelSelector';
import { ScrollPanel } from '../components/ScrollPanel';
import { TemplateListItem } from '../components/TemplateListItem';
import { SETTINGS_PADDING_X } from '../styles';
import { postMessage } from '../useVSCodeMessaging';

type SettingsScreenData = Extract<AppScreen, { type: 'settings' }>;

const sectionHeaderStyle: React.CSSProperties = { fontWeight: 600, fontSize: 13 };

interface Props {
  screen: SettingsScreenData;
}

export function SettingsScreen({ screen }: Props) {
  return (
    <div style={{ padding: 0, display: 'flex', flexDirection: 'column', height: '100%', boxSizing: 'border-box' }}>
      <MenuBar title="Settings" />

      <ScrollPanel
        style={{
          flex: 1,
          minHeight: 0,
          paddingLeft: SETTINGS_PADDING_X,
          paddingRight: SETTINGS_PADDING_X,
          paddingTop: 12,
          paddingBottom: 12,
        }}
      >
        <div style={{ marginBottom: 16 }}>
          <div style={{ ...sectionHeaderStyle, marginBottom: 6 }}>Model</div>
          <ModelSelector selected={screen.selectedModel} hideLabel />
        </div>

        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <div style={sectionHeaderStyle}>Templates</div>
            <button
              onClick={() => postMessage({ type: 'openTemplateEditor' })}
              aria-label="New template"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                background: 'transparent',
                border: 'none',
                color: 'inherit',
                cursor: 'pointer',
                opacity: 0.7,
                fontSize: 12,
                padding: '2px 4px',
                borderRadius: 3,
              }}
            >
              <PlusIcon size={13} /> New
            </button>
          </div>
          {screen.templates.length === 0 ? (
            <div style={{ fontSize: 12, opacity: 0.5, fontStyle: 'italic' }}>No templates</div>
          ) : (
            <div
              role="listbox"
              aria-label="Templates"
              style={{
                border: '1px solid var(--vscode-panel-border, rgba(128,128,128,0.35))',
                borderRadius: 4,
                overflow: 'hidden',
              }}
            >
              {screen.templates.map((t, i) => (
                <TemplateListItem
                  key={t.id}
                  template={t}
                  canDelete={screen.templates.length > 1}
                  isLast={i === screen.templates.length - 1}
                  isSelected={t.id === screen.selectedTemplateId}
                />
              ))}
            </div>
          )}
        </div>
      </ScrollPanel>
    </div>
  );
}
