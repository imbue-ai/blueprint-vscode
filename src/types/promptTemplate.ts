import type { TemplateConfig } from './onboarding';

export const MAX_TEMPLATE_NAME_LENGTH = 1024;

export interface PromptTemplate {
  id: string;
  name: string;
  filename: string;
  mode: 'structured' | 'freeform';
  config: TemplateConfig;
  prompt: string;
}
