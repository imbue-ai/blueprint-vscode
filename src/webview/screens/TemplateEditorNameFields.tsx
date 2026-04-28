import { useState } from 'react';

import { MAX_TEMPLATE_NAME_LENGTH } from '../../types/promptTemplate';
import { Textfield } from '../components/InputComponents';
import { postMessage } from '../useVSCodeMessaging';

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--vscode-descriptionForeground)',
  display: 'block',
  marginBottom: 3,
};

interface Props {
  name: string;
  filename: string;
}

export function TemplateEditorNameFields({ name, filename }: Props) {
  const [nameDraft, setNameDraft] = useState(name);
  const [filenameDraft, setFilenameDraft] = useState(filename);

  const filenameError = filenameDraft.trim().length > 0 && !/\.md$/i.test(filenameDraft.trim());

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
      <div>
        <label style={labelStyle}>Name</label>
        <Textfield
          value={nameDraft}
          onInput={(e) => {
            const value = (e.target as HTMLInputElement).value;
            setNameDraft(value);
            postMessage({ type: 'setTemplateEditorName', name: value });
          }}
          placeholder="Template name"
          maxlength={MAX_TEMPLATE_NAME_LENGTH}
          style={{ width: '100%' }}
        />
      </div>
      <div>
        <label style={labelStyle}>Filename</label>
        <Textfield
          value={filenameDraft}
          onInput={(e) => {
            const value = (e.target as HTMLInputElement).value;
            setFilenameDraft(value);
            postMessage({ type: 'setTemplateEditorFilename', filename: value });
          }}
          placeholder="plan.md"
          style={{
            width: '100%',
            outline: filenameError ? '1px solid var(--vscode-inputValidation-errorBorder, #f44)' : 'none',
          }}
        />
        {filenameError && (
          <span
            style={{ fontSize: 11, color: 'var(--vscode-errorForeground, #f48771)', marginTop: 2, display: 'block' }}
          >
            Must end with .md
          </span>
        )}
      </div>
    </div>
  );
}
