import { randomUUID } from 'crypto';
import * as vscode from 'vscode';

import type { SidebarOutMessage } from '../../types/messages';
import type { SpecDepth, SpecSection, SpecStyle, TemplateConfig } from '../../types/onboarding';
import { DEFAULT_DEPTH, DEFAULT_STYLES, DEFAULT_TEMPLATE_SECTIONS, PRESET_SECTIONS } from '../../types/onboarding';
import type { AppScreen } from '../../types/screens';
import type { App, AppState } from '../app';
import { getModel } from '../session';
import { generateDefaultTemplate } from '../templateGenerator';
import { PromptState } from './prompt';

export class OnboardingState implements AppState {
  private sections: SpecSection[] = DEFAULT_TEMPLATE_SECTIONS.map((s) => ({ ...s }));
  private styles: SpecStyle[] = [...DEFAULT_STYLES];
  private depth: SpecDepth = DEFAULT_DEPTH;
  private notes: string = '';

  handleMessage(app: App, message: SidebarOutMessage): void {
    switch (message.type) {
      case 'addTemplateSection':
        this.addSection(message.presetKey);
        app.broadcast();
        return;
      case 'removeTemplateSection':
        this.sections = this.sections.filter((s) => s.id !== message.sectionId);
        app.broadcast();
        return;
      case 'updateTemplateSection':
        this.updateSection(message.sectionId, message.title, message.description);
        app.broadcast();
        return;
      case 'moveTemplateSection':
        this.moveSection(message.sectionId, message.direction);
        app.broadcast();
        return;
      case 'setTemplateStyles':
        this.styles = message.styles;
        app.broadcast();
        return;
      case 'setTemplateDepth':
        this.depth = message.depth;
        app.broadcast();
        return;
      case 'setTemplateNotes':
        this.notes = message.notes;
        app.broadcast();
        return;
      case 'setModel':
        vscode.workspace
          .getConfiguration('blueprint')
          .update('model', message.model, vscode.ConfigurationTarget.Global)
          .then(() => app.broadcast());
        return;
      case 'completeOnboarding':
        this.complete(app).catch((err) => console.error('Onboarding completion failed:', err));
        return;
    }
  }

  interrupt(): void {}

  isInteractive(): boolean {
    return true;
  }

  getScreen(): AppScreen {
    return { type: 'onboarding', data: this.getData(), selectedModel: getModel() };
  }

  private getData(): TemplateConfig {
    return { sections: this.sections, styles: this.styles, depth: this.depth, notes: this.notes };
  }

  private addSection(presetKey: string | null): void {
    const id = randomUUID();
    if (presetKey) {
      const preset = PRESET_SECTIONS.find((p) => p.key === presetKey);
      if (preset) {
        this.sections.push({ id, title: preset.title, description: preset.description });
        return;
      }
    }
    this.sections.push({ id, title: '', description: '' });
  }

  private updateSection(sectionId: string, title: string, description: string): void {
    const section = this.sections.find((s) => s.id === sectionId);
    if (!section) return;
    section.title = title;
    section.description = description;
  }

  private moveSection(sectionId: string, direction: 'up' | 'down'): void {
    const idx = this.sections.findIndex((s) => s.id === sectionId);
    if (idx === -1) return;
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= this.sections.length) return;
    [this.sections[idx], this.sections[targetIdx]] = [this.sections[targetIdx], this.sections[idx]];
  }

  // Validation lives in the front-end (OnboardingScreen). This handler deliberately trusts
  // whatever arrives — the back-end has no channel to surface rejection back to the user, so
  // double-validation here would crash or silently drop input rather than fix anything. The
  // contract is pinned by tests/onboarding/complete.test.ts ("permissive — empty sections...").
  private async complete(app: App): Promise<void> {
    await generateDefaultTemplate(this.getData());
    app.ctx.context.globalState.update('blueprint.onboardingComplete', true);
    app.setState(new PromptState(app.ctx));
  }
}
