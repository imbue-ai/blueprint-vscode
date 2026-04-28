import { VscodeButton } from '@vscode-elements/react-elements';

import type { TemplateConfig } from '../../types/onboarding';
import type { AppScreen } from '../../types/screens';
import { CollapsibleGroup } from '../components/CollapsibleGroup';
import { ModelSelector } from '../components/ModelSelector';
import { ScrollPanel } from '../components/ScrollPanel';
import {
  ContentGroupBody,
  getSectionDescription,
  getStyleDescription,
  StyleGroupBody,
} from '../components/TemplateFormFields';
import { postMessage } from '../useVSCodeMessaging';

type OnboardingScreenData = Extract<AppScreen, { type: 'onboarding' }>;

interface Props {
  screen: OnboardingScreenData;
}

const MODEL_LABELS: Record<string, string> = {
  'claude-sonnet-4-6': 'Sonnet 4.6',
  'claude-opus-4-6': 'Opus 4.6',
};

function getModelDescription(modelId: string): string {
  return MODEL_LABELS[modelId] ?? modelId;
}

export function OnboardingScreen({ screen }: Props) {
  const data: TemplateConfig = screen.data;
  const hasSections = data.sections.length > 0;
  const sectionDesc = getSectionDescription(data.sections);

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', height: '100%', boxSizing: 'border-box', overflow: 'hidden' }}
    >
      <ScrollPanel
        style={
          {
            flex: 1,
            minHeight: 0,
            paddingLeft: 12,
            '--vscode-font-size': '12px',
          } as React.CSSProperties
        }
      >
        <div style={{ paddingTop: 12 }}>
          <h2 style={{ margin: '0 0 8px 0', fontSize: 16 }}>Welcome to Blueprint</h2>
          <p style={{ margin: '0 0 12px 0', opacity: 0.8, fontSize: 12, lineHeight: 1.5 }}>
            Set up your default plan template. You can always change this or make new plan templates later.
          </p>
        </div>

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

          <CollapsibleGroup
            question="Which model should write plans?"
            description={getModelDescription(screen.selectedModel)}
          >
            <ModelSelector selected={screen.selectedModel} hideLabel />
          </CollapsibleGroup>
        </div>

        <div style={{ marginTop: 12, marginBottom: 12 }}>
          <VscodeButton
            onClick={() => postMessage({ type: 'completeOnboarding' })}
            disabled={!hasSections}
            style={{ width: '100%' }}
          >
            Get started
          </VscodeButton>
        </div>
      </ScrollPanel>
    </div>
  );
}
