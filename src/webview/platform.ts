// Platform is injected by the extension host into <body data-platform="...">.
// Source of truth is process.platform — see utils/webviewContent.ts.
const platform = document.body?.dataset.platform ?? '';
const isMac = platform === 'darwin';

export const SUBMIT_SHORTCUT_LABEL = isMac ? '⌘ Enter' : 'Ctrl+Enter';
