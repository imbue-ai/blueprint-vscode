import { randomUUID } from 'crypto';

import type { SidebarOutMessage } from '../../types/messages';
import type { SpecDepth, SpecSection, SpecStyle, TemplateConfig } from '../../types/onboarding';
import {
  buildPromptFromConfig,
  DEFAULT_DEPTH,
  DEFAULT_STYLES,
  DEFAULT_TEMPLATE_SECTIONS,
  PRESET_SECTIONS,
} from '../../types/onboarding';
import type { PromptTemplate } from '../../types/promptTemplate';
import type { AppScreen, TemplateEditorMode } from '../../types/screens';
import type { App, AppView } from '../app';
import { createTemplate, getTemplate, saveTemplate } from '../prompts';

export class TemplateEditorView implements AppView {
  private name: string;
  private filename: string;
  private mode: TemplateEditorMode;
  private sections: SpecSection[];
  private styles: SpecStyle[];
  private depth: SpecDepth;
  private notes: string;
  private rawPrompt: string;
  private readonly isCreate: boolean;
  private readonly originalId: string;

  constructor(templateId?: string) {
    this.isCreate = !templateId;
    this.originalId = templateId ?? '';

    const existing = templateId ? getTemplate(templateId) : null;
    if (existing) {
      this.name = existing.name;
      this.filename = existing.filename;
      this.mode = existing.mode;
      this.sections = existing.config.sections.map((s) => ({ ...s }));
      this.styles = [...existing.config.styles];
      this.depth = existing.config.depth;
      this.notes = existing.config.notes;
      this.rawPrompt = existing.prompt;
    } else {
      this.name = '';
      this.filename = 'plan.md';
      this.mode = 'structured';
      this.sections = DEFAULT_TEMPLATE_SECTIONS.map((s) => ({ ...s }));
      this.styles = [...DEFAULT_STYLES];
      this.depth = DEFAULT_DEPTH;
      this.notes = '';
      this.rawPrompt = '';
    }
  }

  handleMessage(app: App, message: SidebarOutMessage): void {
    switch (message.type) {
      case 'setTemplateEditorMode':
        this.mode = message.mode;
        app.broadcast();
        return;
      case 'setTemplateEditorName':
        this.name = message.name;
        app.broadcast();
        return;
      case 'setTemplateEditorFilename':
        this.filename = message.filename;
        app.broadcast();
        return;
      case 'setTemplateEditorRawPrompt':
        this.rawPrompt = message.prompt;
        app.broadcast();
        return;
      case 'saveTemplateEditor':
        this.save(app);
        return;
      // Reuse onboarding section messages
      case 'addTemplateSection':
        this.addSection(message.presetKey);
        app.broadcast();
        return;
      case 'removeTemplateSection':
        this.sections = this.sections.filter((s) => s.id !== message.sectionId);
        app.broadcast();
        return;
      case 'updateTemplateSection': {
        const section = this.sections.find((s) => s.id === message.sectionId);
        if (section) {
          section.title = message.title;
          section.description = message.description;
        }
        app.broadcast();
        return;
      }
      case 'moveTemplateSection': {
        const idx = this.sections.findIndex((s) => s.id === message.sectionId);
        if (idx === -1) return;
        const target = message.direction === 'up' ? idx - 1 : idx + 1;
        if (target < 0 || target >= this.sections.length) return;
        [this.sections[idx], this.sections[target]] = [this.sections[target], this.sections[idx]];
        app.broadcast();
        return;
      }
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
    }
  }

  getScreen(): AppScreen {
    return {
      type: 'templateEditor',
      name: this.name,
      filename: this.filename,
      mode: this.mode,
      data: this.getTemplateConfig(),
      rawPrompt: this.rawPrompt,
      isCreate: this.isCreate,
    };
  }

  private getTemplateConfig(): TemplateConfig {
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

  private save(app: App): void {
    const name = this.name.trim();
    const filename = this.filename.trim();
    if (!name || !filename) return;

    const config = this.getTemplateConfig();
    const prompt = this.mode === 'structured' ? buildPromptFromConfig(config) : this.rawPrompt;
    const template: PromptTemplate = {
      id: this.isCreate ? randomUUID() : this.originalId,
      name,
      filename,
      mode: this.mode,
      config,
      prompt,
    };

    const done = () => {
      app.closeView();
      app.broadcast();
    };

    if (this.isCreate) {
      createTemplate(template).then(() => {
        app.ctx.context.workspaceState.update('blueprint.selectedTemplateId', template.id);
        done();
      });
    } else {
      saveTemplate(this.originalId, template).then(done);
    }
  }
}
