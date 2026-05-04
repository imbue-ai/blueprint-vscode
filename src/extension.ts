import * as vscode from 'vscode';

import { App } from './core/app';
import { Editor } from './editor/editor';
import { SidebarProvider } from './sidebarProvider';
import type { ExtensionData } from './types/data';

export function activate(context: vscode.ExtensionContext) {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

  const editor = new Editor(context, workspaceFolder?.uri.fsPath ?? '', (action) => {
    app.handleMessage(action);
  });
  context.subscriptions.push(editor);

  const sidebar = new SidebarProvider(context.extensionUri);
  context.subscriptions.push(vscode.window.registerWebviewViewProvider(SidebarProvider.viewType, sidebar));

  const onUpdate = (data: ExtensionData) => {
    editor.update(data);
    sidebar.sendMessage({ type: 'data', data });
    updateContextKeys(data);
  };

  const app = new App(onUpdate, () => editor.openSpec(), context);

  context.subscriptions.push(
    vscode.commands.registerCommand('blueprint.resetOnboarding', () => {
      app.resetOnboarding();
    }),
    vscode.commands.registerCommand('blueprint.newSpec', () => {
      app.handleMessage({ type: 'openNewSpecView' });
    }),
    vscode.commands.registerCommand('blueprint.openExistingSpec', () => {
      app.handleMessage({ type: 'openExistingSpec' });
    }),
    vscode.commands.registerCommand('blueprint.openSettings', () => {
      app.handleMessage({ type: 'openSettings' });
    }),
    vscode.commands.registerCommand('blueprint.returnFromView', () => {
      app.handleMessage({ type: 'returnFromView' });
    }),
    vscode.commands.registerCommand('blueprint.openSpecEditor', () => {
      app.handleMessage({ type: 'openSpec' });
    }),
  );

  sidebar.onMessage((message) => {
    app.handleMessage(message);
  });

  sidebar.onDidBecomeVisible(() => {
    editor.openSpec();
  });

  return {
    __test: {
      app,
      setSessionFactory: (factory: typeof app.ctx.createSession) => {
        app.ctx.createSession = factory;
      },
    },
  };
}

function updateContextKeys(data: ExtensionData): void {
  if (data.status !== 'ok') {
    vscode.commands.executeCommand('setContext', 'blueprint.screen', 'error');
    return;
  }
  const screen = data.screen;
  vscode.commands.executeCommand('setContext', 'blueprint.screen', screen.type);
  vscode.commands.executeCommand(
    'setContext',
    'blueprint.specFileReady',
    screen.type === 'specEditing' && screen.specFilePath !== '',
  );
}

export function deactivate() {}
