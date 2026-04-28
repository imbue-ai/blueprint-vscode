import { createComponent } from '@lit/react';
import { VscodeTextarea as TextareaBase } from '@vscode-elements/elements/dist/vscode-textarea/vscode-textarea.js';
import { VscodeTextfield as TextfieldBase } from '@vscode-elements/elements/dist/vscode-textfield/vscode-textfield.js';
import { css, type CSSResultGroup } from 'lit';
import React from 'react';

const paddingOverride = css`
  input,
  textarea {
    padding: 5px 8px !important;
  }
`;

function flattenStyles(base: CSSResultGroup): CSSResultGroup[] {
  return Array.isArray(base) ? base.flat() : [base];
}

class AppTextfield extends TextfieldBase {
  static styles = [...flattenStyles(TextfieldBase.styles), paddingOverride];
}
customElements.define('app-textfield', AppTextfield);

class AppTextarea extends TextareaBase {
  static styles = [...flattenStyles(TextareaBase.styles), paddingOverride];
}
customElements.define('app-textarea', AppTextarea);

export const Textfield = createComponent({
  tagName: 'app-textfield',
  elementClass: AppTextfield,
  react: React,
  displayName: 'Textfield',
  events: { onChange: 'change', onInput: 'input', onInvalid: 'invalid' },
});

export const Textarea = createComponent({
  tagName: 'app-textarea',
  elementClass: AppTextarea,
  react: React,
  displayName: 'Textarea',
  events: { onChange: 'change', onInput: 'input', onInvalid: 'invalid' },
});
