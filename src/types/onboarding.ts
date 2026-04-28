export interface SpecSection {
  id: string;
  title: string;
  description: string;
}

export type SpecStyle = 'bullet' | 'diagrams';
export type SpecDepth = 'concise' | 'comprehensive';

export interface TemplateConfig {
  sections: SpecSection[];
  styles: SpecStyle[];
  depth: SpecDepth;
  notes: string;
}

export interface PresetSection {
  key: string;
  title: string;
  description: string;
}

export const PRESET_SECTIONS: PresetSection[] = [
  {
    key: 'overview',
    title: 'Overview',
    description: 'An overview of the feature and the UX of using it',
  },
  {
    key: 'summary',
    title: 'Summary',
    description: 'A summary of how the system will work and the key data flows',
  },
  {
    key: 'implementation',
    title: 'Implementation plan',
    description:
      'The full list of files, classes, methods, functions, data types, etc to create/modify and what they will do',
  },
  {
    key: 'phases',
    title: 'Implementation phases',
    description:
      'Break the implementation into ordered phases, where each phase builds on the previous and results in a working (but potentially incomplete) system',
  },
  {
    key: 'open-questions',
    title: 'Open questions',
    description:
      'List any unresolved design decisions, trade-offs, or ambiguities that need further discussion before implementation',
  },
  {
    key: 'expected-behavior',
    title: 'Expected behavior',
    description: "Describe the resulting behavior from the user's or system's perspective",
  },
  {
    key: 'testing',
    title: 'Testing strategy',
    description: 'How the implementation should be tested, including unit tests, integration tests, and edge cases',
  },
  {
    key: 'data-model',
    title: 'Data model',
    description: 'Database schemas, data structures, and relationships between entities',
  },
  {
    key: 'api-design',
    title: 'API design',
    description: 'API endpoints, request/response formats, and interface contracts',
  },
];

const expectedBehaviorSection = PRESET_SECTIONS.find((p) => p.key === 'expected-behavior')!;

export const DEFAULT_TEMPLATE_SECTIONS: SpecSection[] = [
  { id: '1', title: 'Overview', description: PRESET_SECTIONS[0].description },
  { id: '2', title: expectedBehaviorSection.title, description: expectedBehaviorSection.description },
];

export const DEFAULT_STYLES: SpecStyle[] = ['bullet'];
export const DEFAULT_DEPTH: SpecDepth = 'concise';

export function buildPromptFromConfig(data: TemplateConfig): string {
  const lines: string[] = [];

  if (data.sections.length > 0) {
    lines.push('The plan should contain EXACTLY the following sections in the specified order.');

    for (const section of data.sections) {
      const title = section.title.trim() || 'Untitled';
      const desc = section.description.trim();
      if (desc) {
        lines.push(`- ${title}: ${desc}`);
      } else {
        lines.push(`- ${title}`);
      }
    }

    lines.push('');
    const depthNote = data.depth === 'concise' ? 'Be concise and to the point.' : 'Be comprehensive and detailed.';
    const styleInstructions: string[] = [];
    if (data.styles.includes('bullet')) styleInstructions.push('use bullet points with short, focused sentences');
    if (data.styles.includes('diagrams'))
      styleInstructions.push('use diagrams where a diagram explains better than text');

    const styleNote =
      styleInstructions.length > 0
        ? `${styleInstructions[0].charAt(0).toUpperCase() + styleInstructions[0].slice(1)}${styleInstructions.length > 1 ? '; also ' + styleInstructions.slice(1).join(', ') : ''}.`
        : '';
    lines.push(`${depthNote}${styleNote ? ' ' + styleNote : ''}`);
  }

  if (data.notes.trim()) {
    lines.push('');
    lines.push('Additional notes:');
    lines.push(data.notes.trim());
  }

  return lines.join('\n');
}
