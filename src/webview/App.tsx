import { useCallback, useEffect, useState } from 'react';

import type { ExtensionData } from '../types/data';
import type { SidebarInMessage } from '../types/messages';
import { RateLimitBanner } from './components/RateLimitBanner';
import { OnboardingScreen } from './screens/OnboardingScreen';
import { PromptRefinementScreen } from './screens/PromptRefinementScreen';
import { PromptScreen } from './screens/PromptScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { SpecEditingScreen } from './screens/SpecEditingScreen';
import { TemplateEditorScreen } from './screens/TemplateEditorScreen';
import { postMessage, useMessageHandler } from './useVSCodeMessaging';

export function App() {
  const [data, setData] = useState<ExtensionData | null>(null);
  const [rateLimitDismissed, setRateLimitDismissed] = useState(false);

  useEffect(() => {
    postMessage({ type: 'requestData' });
  }, []);

  const handleMessage = useCallback((msg: SidebarInMessage) => {
    if (msg.type === 'data') {
      setData((prev) => {
        const prevResets = prev?.status === 'ok' ? prev.rateLimitResetsAt : undefined;
        const newResets = msg.data.status === 'ok' ? msg.data.rateLimitResetsAt : undefined;
        if (newResets !== prevResets) setRateLimitDismissed(false);
        return msg.data;
      });
    }
  }, []);
  useMessageHandler(handleMessage);

  if (!data) {
    return <div style={{ padding: 12, opacity: 0.7 }}>Initializing...</div>;
  }

  if (data.status === 'error') {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          padding: 24,
          textAlign: 'center',
          gap: 8,
        }}
      >
        <p style={{ fontSize: 14, opacity: 0.8 }}>{data.msg}</p>
        {data.link && (
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              postMessage({ type: 'openLink', url: data.link!.url });
            }}
            style={{ fontSize: 13, color: 'var(--vscode-textLink-foreground)', cursor: 'pointer' }}
          >
            {data.link.label}
          </a>
        )}
      </div>
    );
  }

  let screen: JSX.Element;
  switch (data.screen.type) {
    case 'onboarding':
      screen = <OnboardingScreen screen={data.screen} />;
      break;
    case 'prompt':
      screen = <PromptScreen screen={data.screen} />;
      break;
    case 'promptRefinement':
      screen = <PromptRefinementScreen screen={data.screen} />;
      break;
    case 'specEditing':
      screen = <SpecEditingScreen screen={data.screen} />;
      break;
    case 'settings':
      screen = <SettingsScreen screen={data.screen} />;
      break;
    case 'templateEditor':
      screen = <TemplateEditorScreen screen={data.screen} />;
      break;
  }

  return (
    <div style={{ position: 'relative', height: '100%' }}>
      {screen}
      {data.rateLimitResetsAt && !rateLimitDismissed && (
        <RateLimitBanner resetsAt={data.rateLimitResetsAt} onDismiss={() => setRateLimitDismissed(true)} />
      )}
    </div>
  );
}
