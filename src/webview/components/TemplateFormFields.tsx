import { VscodeCheckbox, VscodeRadio, VscodeRadioGroup } from '@vscode-elements/react-elements';

import type { SpecDepth, SpecSection, SpecStyle, TemplateConfig } from '../../types/onboarding';
import { DEFAULT_DEPTH, DEFAULT_STYLES, DEFAULT_TEMPLATE_SECTIONS } from '../../types/onboarding';
import { postMessage } from '../useVSCodeMessaging';
import { AddSectionMenu } from './AddSectionMenu';
import { Textarea } from './InputComponents';
import { SectionItem } from './SectionItem';

export function getSectionDescription(sections: SpecSection[]): { text: string; isError: boolean } {
  if (sections.length === 0) return { text: 'At least one section is required', isError: true };
  const isDefault =
    sections.length === DEFAULT_TEMPLATE_SECTIONS.length &&
    sections.every((s, i) => s.title === DEFAULT_TEMPLATE_SECTIONS[i].title);
  const prefix = isDefault ? 'Default' : 'Custom';
  const names = sections.map((s) => s.title || 'Untitled');
  const preview = names.slice(0, 3).join(', ');
  const extra = names.length - 3;
  return { text: extra > 0 ? `${prefix}: ${preview} + ${extra} more` : `${prefix}: ${preview}`, isError: false };
}

export function getStyleDescription(styles: SpecStyle[], depth: string): string {
  const isDefault =
    depth === DEFAULT_DEPTH &&
    styles.length === DEFAULT_STYLES.length &&
    styles.every((s) => DEFAULT_STYLES.includes(s));
  const depthLabel = DEPTH_OPTIONS.find((o) => o.value === depth)?.label ?? depth;
  const styleLabels = styles.map((s) => STYLE_OPTIONS.find((o) => o.value === s)?.label ?? s).join(', ');
  const summary = styleLabels ? `${depthLabel}, ${styleLabels}` : depthLabel;
  return isDefault ? `Default: ${summary}` : `Custom: ${summary}`;
}

const STYLE_OPTIONS: { value: SpecStyle; label: string; description: string }[] = [
  { value: 'bullet', label: 'Bullet points', description: 'Short, focused bullet points in each section' },
  { value: 'diagrams', label: 'Diagrams', description: 'Visual diagrams where a diagram explains better than text' },
];

const DEPTH_OPTIONS: { value: SpecDepth; label: string }[] = [
  { value: 'concise', label: 'Concise' },
  { value: 'comprehensive', label: 'Comprehensive' },
];

export function ContentGroupBody({ data }: { data: TemplateConfig }) {
  return (
    <>
      <p style={{ margin: '4px 0 10px', fontSize: 12, opacity: 0.7, lineHeight: 1.5 }}>
        Customize the structure of the plan by adding, removing, or reordering sections.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {data.sections.map((section, i) => (
          <SectionItem
            key={section.id}
            section={section}
            index={i}
            total={data.sections.length}
            siblingTitles={data.sections.filter((s) => s.id !== section.id).map((s) => s.title)}
          />
        ))}
      </div>
      <div style={{ marginTop: 12 }}>
        <AddSectionMenu existingSectionTitles={data.sections.map((s) => s.title)} />
      </div>
      <div style={{ marginTop: 20 }}>
        <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>
          Any additional notes?
        </label>
        <Textarea
          value={data.notes}
          onInput={(e) => postMessage({ type: 'setTemplateNotes', notes: (e.target as HTMLTextAreaElement).value })}
          placeholder="e.g. Don't include any implementation details"
          rows={3}
          style={{ width: '100%' }}
        />
      </div>
    </>
  );
}

export function StyleGroupBody({ data }: { data: TemplateConfig }) {
  const toggleStyle = (style: SpecStyle) => {
    const next = data.styles.includes(style) ? data.styles.filter((s) => s !== style) : [...data.styles, style];
    postMessage({ type: 'setTemplateStyles', styles: next });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 4 }}>
      <div>
        <p style={{ margin: '0 0 8px', fontSize: 12, opacity: 0.7, lineHeight: 1.5 }}>
          How much detail should each section contain?
        </p>
        <VscodeRadioGroup>
          {DEPTH_OPTIONS.map((opt) => (
            <VscodeRadio
              key={opt.value}
              name="depth"
              checked={data.depth === opt.value}
              onChange={() => postMessage({ type: 'setTemplateDepth', depth: opt.value })}
            >
              {opt.label}
            </VscodeRadio>
          ))}
        </VscodeRadioGroup>
      </div>

      <div>
        <p style={{ margin: '0 0 8px', fontSize: 12, opacity: 0.7, lineHeight: 1.5 }}>
          How should the content of each section be written?
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {STYLE_OPTIONS.map((opt) => (
            <div key={opt.value}>
              <VscodeCheckbox checked={data.styles.includes(opt.value)} onChange={() => toggleStyle(opt.value)}>
                {opt.label}
              </VscodeCheckbox>
              <div style={{ fontSize: 11, opacity: 0.6, marginTop: 1, paddingLeft: 22 }}>{opt.description}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
