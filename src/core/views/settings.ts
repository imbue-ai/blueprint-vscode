import * as vscode from 'vscode';

import type { SidebarOutMessage } from '../../types/messages';
import type { AppScreen } from '../../types/screens';
import type { App, AppView } from '../app';
import { deleteTemplate, getTemplates, resolveSelectedTemplate } from '../prompts';
import { getModel } from '../session';

const SELECTED_TEMPLATE_KEY = 'blueprint.selectedTemplateId';

export class SettingsView implements AppView {
  constructor(private readonly workspaceState: vscode.Memento) {}

  handleMessage(app: App, message: SidebarOutMessage): void {
    if (message.type === 'setModel') {
      vscode.workspace
        .getConfiguration('blueprint')
        .update('model', message.model, vscode.ConfigurationTarget.Global)
        .then(() => app.broadcast());
    } else if (message.type === 'deleteTemplate') {
      deleteTemplate(message.templateId).then(() => {
        if (this.workspaceState.get<string>(SELECTED_TEMPLATE_KEY) === message.templateId) {
          this.workspaceState.update(SELECTED_TEMPLATE_KEY, resolveSelectedTemplate(undefined)?.id);
        }
        app.broadcast();
      });
    } else if (message.type === 'setSpecTemplate') {
      this.workspaceState.update(SELECTED_TEMPLATE_KEY, message.id);
      app.broadcast();
    }
  }

  getScreen(): AppScreen {
    const templates = getTemplates();
    const persisted = this.workspaceState.get<string>(SELECTED_TEMPLATE_KEY);
    const selectedTemplateId = resolveSelectedTemplate(persisted, templates)?.id ?? '';
    return {
      type: 'settings',
      selectedModel: getModel(),
      templates,
      selectedTemplateId,
    };
  }
}
