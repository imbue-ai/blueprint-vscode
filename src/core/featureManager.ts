import * as fs from 'fs';
import * as path from 'path';

import type { ClaudeSession } from './session';
import { RateLimitError } from './session';
import { SLUG_SYSTEM_PROMPT } from './systemPrompts';

export const SPEC_DIR = 'blueprint';

export async function generateFeatureSlug(session: ClaudeSession, text: string, workingDir: string): Promise<string> {
  let slug: string;

  try {
    const slugSession = session.fork('Feature slug');
    const truncatedText = text.slice(0, 500);
    const prompt = `Generate a 2-5 word kebab-case directory name for this feature. Output ONLY the slug, nothing else.\n\n${truncatedText}`;

    let rawSlug = '';
    for await (const message of slugSession.prompt(prompt, { systemPrompt: SLUG_SYSTEM_PROMPT })) {
      if (message.type === 'assistant') {
        const content = message.message?.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (typeof block === 'object' && block !== null && 'text' in block) {
              rawSlug += (block as { text: string }).text;
            }
          }
        }
      }
    }

    slug = sanitizeSlug(rawSlug);
  } catch (error) {
    if (error instanceof RateLimitError) throw error;
    slug = `feature-${Date.now()}`;
  }

  return deduplicateFeature(slug, path.join(workingDir, SPEC_DIR));
}

function sanitizeSlug(raw: string): string {
  let slug = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);

  if (!slug) {
    slug = `feature-${Date.now()}`;
  }
  return slug;
}

function deduplicateFeature(slug: string, specDirPath: string): string {
  if (!fs.existsSync(specDirPath)) return slug;
  if (!fs.existsSync(path.join(specDirPath, slug))) return slug;

  let counter = 2;
  while (fs.existsSync(path.join(specDirPath, `${slug}-${counter}`))) {
    counter++;
  }
  return `${slug}-${counter}`;
}
