import type { SidebarOutMessage } from '../../types/messages';
import type { AppScreen } from '../../types/screens';
import type { App, AppContext, AppState } from '../app';
import { GeneratingPromptQuestionsState } from './generatingPromptQuestions';

export class PromptState implements AppState {
  private prompt: string = '';
  private readonly ctx: AppContext;

  constructor(ctx: AppContext, prompt?: string) {
    this.ctx = ctx;
    this.prompt = prompt ?? '';
  }

  private getSelectedTemplateId(): string {
    return this.ctx.context.workspaceState.get<string>('blueprint.selectedTemplateId') ?? '';
  }

  handleMessage(app: App, message: SidebarOutMessage): void {
    switch (message.type) {
      case 'setPrompt':
        this.prompt = message.prompt;
        app.broadcast();
        return;
      case 'submitSpecPrompt':
        if (!this.prompt.trim()) return;
        app.setState(new GeneratingPromptQuestionsState(this.ctx, this.prompt, this.getSelectedTemplateId()));
        return;
    }
  }

  interrupt(): void {}

  isInteractive(): boolean {
    return true;
  }

  getScreen(): AppScreen {
    return {
      type: 'prompt',
      prompt: this.prompt,
    };
  }
}
