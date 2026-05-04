import * as vscode from 'vscode';

import type { App } from '../../src/core/app';
import type { ClaudeSessionFactory } from '../../src/core/session';
import type { ExtensionData } from '../../src/types/data';
import type { SidebarOutMessage } from '../../src/types/messages';
import type { AppScreen } from '../../src/types/screens';
import { FakeSessionFactory } from './fakeSession';

const EXTENSION_ID = 'Imbue.imbue-blueprint';

interface TestApi {
  app: App;
  setSessionFactory: (factory: ClaudeSessionFactory) => void;
}

export interface Harness {
  app: App;
  fakes: FakeSessionFactory;
  /** All ExtensionData broadcasts since installation. */
  broadcasts: ExtensionData[];
  /** Latest broadcast, or null if none yet. */
  latest(): ExtensionData | null;
  /** Latest screen of `type === t`, or null. Useful: `await waitFor(() => h.screenOfType('promptRefinement'))`. */
  screenOfType<T extends AppScreen['type']>(t: T): Extract<AppScreen, { type: T }> | null;
  /** Send a message into App as if from the webview. */
  send(message: SidebarOutMessage): void;
  /** Tear down listeners and restore the live session factory. */
  dispose(): void;
}

export async function setupHarness(): Promise<Harness> {
  const ext = vscode.extensions.getExtension(EXTENSION_ID);
  if (!ext) throw new Error(`extension ${EXTENSION_ID} not found`);
  const api = ((await ext.activate()) as { __test?: TestApi }).__test;
  if (!api) throw new Error('extension test API not available');

  const fakes = new FakeSessionFactory();
  api.setSessionFactory(fakes.factory());

  const broadcasts: ExtensionData[] = [];
  const unsubscribe = api.app.addDataListener((d) => broadcasts.push(d));

  return {
    app: api.app,
    fakes,
    broadcasts,
    latest: () => broadcasts[broadcasts.length - 1] ?? null,
    screenOfType<T extends AppScreen['type']>(t: T): Extract<AppScreen, { type: T }> | null {
      for (let i = broadcasts.length - 1; i >= 0; i--) {
        const b = broadcasts[i];
        if (b.status === 'ok' && b.screen.type === t) {
          return b.screen as Extract<AppScreen, { type: T }>;
        }
      }
      return null;
    },
    send: (message) => api.app.handleMessage(message),
    dispose: () => {
      unsubscribe();
      // restore live factory by reactivating: simplest path is to leave the
      // injected fake in place — each test installs its own at setupHarness.
    },
  };
}

/** Poll predicate until truthy or timeout (ms). Throws on timeout. */
export async function waitFor<T>(
  predicate: () => T | null | undefined,
  timeoutMs = 2000,
  label = 'condition',
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const v = predicate();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error(`waitFor timed out: ${label}`);
}

/** Reset all blueprint-related extension state to a clean baseline. */
export async function resetExtensionState(app: App): Promise<void> {
  await vscode.workspace
    .getConfiguration('blueprint')
    .update('promptTemplates', undefined, vscode.ConfigurationTarget.Global);
  await app.ctx.context.globalState.update('blueprint.onboardingComplete', undefined);
  await app.ctx.context.workspaceState.update('blueprint.selectedTemplateId', undefined);
}
