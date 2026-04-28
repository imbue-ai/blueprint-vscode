import * as vscode from 'vscode';

import type { SidebarInMessage, SidebarOutMessage } from './types/messages';
import { getWebviewContent } from './utils/webviewContent';

export class SidebarProvider implements vscode.WebviewViewProvider {
  static readonly viewType = 'blueprint.sidebarView';

  private webview?: vscode.Webview;
  private pendingMessages: SidebarInMessage[] = [];
  private messageHandler?: (message: SidebarOutMessage) => void;
  private visibilityHandler?: () => void;

  constructor(private readonly extensionUri: vscode.Uri) {}

  onMessage(handler: (message: SidebarOutMessage) => void): void {
    this.messageHandler = handler;
  }

  onDidBecomeVisible(handler: () => void): void {
    this.visibilityHandler = handler;
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.webview = webviewView.webview;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };

    webviewView.webview.html = getWebviewContent(webviewView.webview, this.extensionUri);

    for (const message of this.pendingMessages) {
      webviewView.webview.postMessage(message);
    }
    this.pendingMessages = [];

    webviewView.webview.onDidReceiveMessage((message: SidebarOutMessage) => {
      if (message.type === 'openLink') {
        vscode.env.openExternal(vscode.Uri.parse(message.url));
        return;
      }
      this.messageHandler?.(message);
    });

    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) this.visibilityHandler?.();
    });

    webviewView.onDidDispose(() => {
      this.webview = undefined;
    });
  }

  sendMessage(message: SidebarInMessage): void {
    if (this.webview) {
      this.webview.postMessage(message);
    } else {
      this.pendingMessages.push(message);
    }
  }
}
