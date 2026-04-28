import * as vscode from 'vscode';

export function getWebviewContent(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'webview', 'sidebar.js'));
  const nonce = getNonce();
  const platform = process.platform;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>Blueprint</title>
  <style>
    html, body, #root {
      height: 100%;
      margin: 0;
      padding: 0;
    }
    body {
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }
    .markdown-content p { margin: 0 0 8px 0; }
    .markdown-content p:last-child { margin-bottom: 0; }
    .markdown-content h1, .markdown-content h2, .markdown-content h3,
    .markdown-content h4, .markdown-content h5, .markdown-content h6 {
      margin: 12px 0 8px 0; font-weight: 600;
    }
    .markdown-content h1 { font-size: 1.4em; }
    .markdown-content h2 { font-size: 1.2em; }
    .markdown-content h3 { font-size: 1.1em; }
    .markdown-content code {
      font-family: var(--vscode-editor-font-family, monospace);
      background-color: var(--vscode-textCodeBlock-background);
      padding: 2px 4px; border-radius: 3px; font-size: 0.9em;
    }
    .markdown-content pre {
      background-color: var(--vscode-textCodeBlock-background);
      padding: 8px; border-radius: 4px; overflow-x: auto; margin: 8px 0;
    }
    .markdown-content pre code { background: none; padding: 0; }
    .markdown-content ul, .markdown-content ol { margin: 8px 0; padding-left: 20px; }
    .markdown-content li { margin: 4px 0; }
    .markdown-content blockquote {
      border-left: 3px solid var(--vscode-textBlockQuote-border);
      margin: 8px 0; padding-left: 12px; opacity: 0.9;
    }
    .markdown-content a { color: var(--vscode-textLink-foreground); }
    .markdown-content strong { font-weight: 600; }

  </style>
</head>
<body data-platform="${platform}">
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
