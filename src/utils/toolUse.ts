import type { StreamItem } from '../types/screens';

/** Short basename from a file path (e.g. "/foo/bar/baz.ts" → "baz.ts"). */
function basename(p: unknown): string {
  if (typeof p !== 'string') return '';
  const parts = p.split('/');
  return parts[parts.length - 1] || p;
}

export function extractToolUseFromContent(content: unknown[]): { name: string; input: Record<string, unknown> } | null {
  const toolUse = content.find(
    (block): block is { type: 'tool_use'; name: string; input: Record<string, unknown> } =>
      typeof block === 'object' && block !== null && (block as { type?: string }).type === 'tool_use',
  );
  return toolUse ?? null;
}

// --- Display filtering ---
// All special-case logic for which tool calls to show and how to display them.

const HIDDEN_ARG_KEYS: Record<string, Set<string>> = {
  Bash: new Set(['description']),
};

// Matches temp files written by writeSpecTemplateFile() in utils/specTemplate.ts.
// Uses substring match so callers don't need to pass the exact path.
function isHiddenToolCall(args: Record<string, unknown>): boolean {
  const filePath = args.file_path;
  return typeof filePath === 'string' && filePath.includes('blueprint-spec-template-');
}

function deriveToolCallSummary(name: string, args: Record<string, unknown>): string {
  switch (name) {
    case 'Read':
    case 'Edit':
    case 'Write':
      return basename(args.file_path);
    case 'Glob':
      return String(args.pattern ?? '');
    case 'Grep':
      return String(args.pattern ?? '');
    case 'WebSearch':
      return String(args.query ?? '');
    case 'WebFetch':
      return 'Fetching page';
    default: {
      const firstString = Object.values(args).find((v) => typeof v === 'string');
      return firstString ? String(firstString) : '';
    }
  }
}

function filterArgs(name: string, args: Record<string, unknown>): Record<string, unknown> {
  const hidden = HIDDEN_ARG_KEYS[name];
  if (!hidden) return args;
  return Object.fromEntries(Object.entries(args).filter(([key]) => !hidden.has(key)));
}

/**
 * Creates a tool_call StreamItem from a tool use, applying display filters.
 * Returns null if the tool call should be hidden from the UI.
 */
export function createToolCallStreamItem(
  name: string,
  input: Record<string, unknown>,
): Extract<StreamItem, { type: 'tool_call' }> | null {
  if (isHiddenToolCall(input)) return null;
  return {
    type: 'tool_call',
    name,
    summary: deriveToolCallSummary(name, input),
    args: filterArgs(name, input),
  };
}
