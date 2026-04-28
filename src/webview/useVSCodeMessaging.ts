import { useEffect, useRef } from 'react';

import type { SidebarInMessage, SidebarOutMessage } from '../types/messages';

interface VSCodeApi {
  postMessage: (message: unknown) => void;
  getState: <T = unknown>() => T | undefined;
  setState: <T>(state: T) => T;
}

declare function acquireVsCodeApi(): VSCodeApi;

const vscodeApi = acquireVsCodeApi();

export function postMessage(message: SidebarOutMessage): void {
  vscodeApi.postMessage(message);
}

export function getWebviewState(): Record<string, unknown> {
  return vscodeApi.getState<Record<string, unknown>>() ?? {};
}

export function setWebviewState(state: Record<string, unknown>): void {
  vscodeApi.setState(state);
}

export function useMessageHandler(handler: (message: SidebarInMessage) => void): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const listener = (event: MessageEvent<SidebarInMessage>) => {
      handlerRef.current(event.data);
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, []);
}
