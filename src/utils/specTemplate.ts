import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { getTemplatePrompt, resolveSelectedTemplate, SPEC_PROMPT, wrapTemplatePrompt } from '../core/prompts';

function resolveSpecTemplateContent(templateId: string): string {
  const selected = resolveSelectedTemplate(templateId);
  return wrapTemplatePrompt(selected ? getTemplatePrompt(selected) : SPEC_PROMPT);
}

export function writeSpecTemplateFile(templateId: string): string {
  const content = resolveSpecTemplateContent(templateId);
  const filePath = path.join(os.tmpdir(), `blueprint-spec-template-${Date.now()}.md`);
  fs.writeFileSync(filePath, content);
  return filePath;
}

export function cleanupSpecTemplateFile(filePath: string | null): void {
  if (!filePath) return;
  fs.unlink(filePath, () => {});
}
