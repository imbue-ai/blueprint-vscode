import { randomUUID } from 'crypto';
import * as vscode from 'vscode';

import type { TemplateConfig } from '../types/onboarding';
import { buildPromptFromConfig } from '../types/onboarding';
import type { PromptTemplate } from '../types/promptTemplate';

export async function generateDefaultTemplate(data: TemplateConfig): Promise<void> {
  const prompt = buildPromptFromConfig(data);
  const template: PromptTemplate = {
    id: randomUUID(),
    name: 'Default',
    prompt,
    filename: 'plan.md',
    mode: 'structured',
    config: data,
  };

  await vscode.workspace
    .getConfiguration('blueprint')
    .update('promptTemplates', [template], vscode.ConfigurationTarget.Global);
}
