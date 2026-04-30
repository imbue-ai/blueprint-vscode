import * as vscode from 'vscode';

import type { ExtensionData } from '../types/data';
import type { SidebarOutMessage } from '../types/messages';
import type { AppScreen } from '../types/screens';
import { findClaudePath, validateClaudePath } from '../utils/findClaude';
import { type ClaudeSessionFactory, createLiveSessionFactory } from './session';
import { OnboardingState } from './states/onboarding';
import { PromptState } from './states/prompt';
import { SettingsView } from './views/settings';
import { TemplateEditorView } from './views/templateEditor';

export interface AppState {
  onEnter?(app: App): void;
  onRestore?(): void;
  handleMessage(app: App, message: SidebarOutMessage): void;
  interrupt(): void;
  getScreen(): AppScreen;
  isInteractive(): boolean;
}

export interface AppView {
  handleMessage(app: App, message: SidebarOutMessage): void;
  getScreen(): AppScreen;
}

type OnUpdateFn = (data: ExtensionData) => void;
type OpenSpecFn = () => void;

export interface AppContext {
  claudePath: string;
  workingDir: string;
  context: vscode.ExtensionContext;
  createSession: ClaudeSessionFactory;
}

export class App {
  private readonly onUpdate: OnUpdateFn;
  private readonly openSpecFn: OpenSpecFn;
  private error: { msg: string; link?: { label: string; url: string } } | null = null;
  private state: AppState;
  private lastInteractiveState: AppState | null = null;
  private rateLimitResetsAt: number | undefined;
  private viewStack: AppView[] = [];
  // True for exactly one broadcast — the one immediately following a setState
  // that transitioned us into the spec-editing screen from a different screen
  // type. Cleared in broadcast() after onUpdate fires.
  private freshSpecEntry = false;
  readonly ctx: AppContext;

  constructor(
    onUpdate: OnUpdateFn,
    openSpec: OpenSpecFn,
    context: vscode.ExtensionContext,
    sessionFactory?: ClaudeSessionFactory,
  ) {
    this.onUpdate = onUpdate;
    this.openSpecFn = openSpec;

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceFolder) {
      this.error = { msg: 'Open a folder to use Blueprint.' };
    }
    const claudePath = findClaudePath();
    if (!claudePath) {
      this.error = {
        msg: 'Claude Code CLI not found.',
        link: { label: 'Install Claude Code.', url: 'https://claude.com/product/claude-code' },
      };
    } else {
      const validationError = validateClaudePath(claudePath);
      if (validationError) {
        this.error = { msg: validationError };
      }
    }

    const resolvedClaudePath = claudePath ?? '';
    const resolvedWorkingDir = workspaceFolder ?? '';
    this.ctx = {
      claudePath: resolvedClaudePath,
      workingDir: resolvedWorkingDir,
      context,
      createSession: sessionFactory ?? createLiveSessionFactory(resolvedWorkingDir, resolvedClaudePath),
    };

    const needsOnboarding = !context.globalState.get<boolean>('blueprint.onboardingComplete', false);
    this.state = needsOnboarding ? new OnboardingState() : new PromptState(this.ctx);
    this.lastInteractiveState = this.state;
  }

  handleMessage(message: SidebarOutMessage): void {
    switch (message.type) {
      case 'requestData':
        this.broadcast();
        return;
      case 'openNewSpecView':
        void this.handleStartNewSpec();
        return;
      case 'openSettings':
        this.viewStack = [new SettingsView(this.ctx.context.workspaceState)];
        this.broadcast();
        return;
      case 'returnFromView':
        this.viewStack.pop();
        this.broadcast();
        return;
      case 'openSpec':
        this.openSpecFn();
        return;
      case 'openExistingSpec':
        this.handleOpenExistingSpec();
        return;
      case 'openTemplateEditor':
        this.viewStack.push(new TemplateEditorView(message.templateId));
        this.broadcast();
        return;
    }

    const currentView = this.currentView;
    if (currentView) {
      currentView.handleMessage(this, message);
      return;
    }

    this.state.handleMessage(this, message);
  }

  private async handleStartNewSpec(): Promise<void> {
    if (this.isSessionActive()) {
      const choice = await vscode.window.showWarningMessage(
        'Your current session will be lost. The plan file will remain in the codebase.',
        { modal: true },
        'Start new plan',
      );
      if (choice !== 'Start new plan') return;
    }
    this.viewStack = [];
    this.setState(new PromptState(this.ctx));
  }

  private async handleOpenExistingSpec(): Promise<void> {
    const uris = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectMany: false,
      filters: { Markdown: ['md'] },
      defaultUri: vscode.Uri.file(this.ctx.workingDir),
    });
    if (!uris || uris.length === 0) return;

    const filePath = uris[0].fsPath;
    const path = await import('path');
    const specRelPath = path.relative(this.ctx.workingDir, filePath);

    if (specRelPath.startsWith('..')) {
      vscode.window.showErrorMessage('Plan file must be inside the workspace.');
      return;
    }

    const fs = await import('fs');
    let content: string;
    try {
      content = fs.readFileSync(filePath, 'utf-8');
    } catch (err) {
      vscode.window.showErrorMessage(`Failed to read file: ${err}`);
      return;
    }

    if (!content.trim()) {
      vscode.window.showErrorMessage('Plan file is empty.');
      return;
    }

    this.viewStack = [];
    const { StartingEditorAgentState } = await import('./states/startingEditorAgent');
    this.setState(new StartingEditorAgentState(this.ctx, specRelPath, content, ''));
  }

  private get currentView(): AppView | null {
    return this.viewStack.length > 0 ? this.viewStack[this.viewStack.length - 1] : null;
  }

  private getData(): ExtensionData {
    if (this.error) return { status: 'error', msg: this.error.msg, link: this.error.link };
    let screen = this.currentView ? this.currentView.getScreen() : this.state.getScreen();
    if (screen.type === 'specEditing' && this.freshSpecEntry) {
      screen = { ...screen, freshEntry: true };
    }
    return { status: 'ok', screen, rateLimitResetsAt: this.rateLimitResetsAt };
  }

  broadcast(): void {
    const data = this.getData();
    this.onUpdate(data);
    for (const listener of this.dataListeners) listener(data);
    this.freshSpecEntry = false;
  }

  private dataListeners: ((data: ExtensionData) => void)[] = [];

  addDataListener(listener: (data: ExtensionData) => void): () => void {
    this.dataListeners.push(listener);
    return () => {
      this.dataListeners = this.dataListeners.filter((l) => l !== listener);
    };
  }

  setState(newState: AppState): void {
    const wasSpecEditing = this.state.getScreen().type === 'specEditing';
    this.state.interrupt();
    this.state = newState;
    this.rateLimitResetsAt = undefined;
    if (newState.isInteractive()) {
      this.lastInteractiveState = newState;
    }
    const isSpecEditing = newState.getScreen().type === 'specEditing';
    this.freshSpecEntry = isSpecEditing && !wasSpecEditing;
    this.broadcast();
    newState.onEnter?.(this);
  }

  closeView(): void {
    this.viewStack.pop();
  }

  onRateLimit(resetsAt?: number): void {
    this.state.interrupt();
    if (this.lastInteractiveState) {
      this.state = this.lastInteractiveState;
      this.state.onRestore?.();
    }
    this.rateLimitResetsAt = resetsAt;
    this.broadcast();
  }

  isSessionActive(): boolean {
    return !(this.state instanceof OnboardingState || this.state instanceof PromptState);
  }

  async resetOnboarding(): Promise<void> {
    this.state.interrupt();
    this.viewStack = [];
    this.ctx.context.globalState.update('blueprint.onboardingComplete', undefined);
    await vscode.workspace
      .getConfiguration('blueprint')
      .update('promptTemplates', undefined, vscode.ConfigurationTarget.Global);
    this.state = new OnboardingState();
    this.lastInteractiveState = this.state;
    this.broadcast();
  }
}
