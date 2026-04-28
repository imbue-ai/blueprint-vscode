import type { AppScreen } from './screens';

export type ExtensionData =
  | { status: 'error'; msg: string; link?: { label: string; url: string } }
  | { status: 'ok'; screen: AppScreen; rateLimitResetsAt?: number };
