// State module - tracks seen articles to avoid duplicates
import { createHash } from 'crypto';
import { getConfig } from './config';

export interface SeenArticle {
  url: string;
  title: string;
  source: string;
  contentType: 'technical' | 'announcement';
  postedAt: string;
}

export interface State {
  seen: Record<string, SeenArticle>;
  alertedSources?: Record<string, string>; // source name -> alerted timestamp
}

function articleId(url: string): string {
  return createHash('sha256').update(url).digest('hex').slice(0, 16);
}

export async function loadState(): Promise<State> {
  const config = getConfig();
  const file = Bun.file(config.stateFilePath);

  if (await file.exists()) {
    try {
      const content = await file.text();
      return JSON.parse(content) as State;
    } catch (e) {
      console.warn('Failed to parse state file, starting fresh:', e);
      return { seen: {} };
    }
  }

  return { seen: {} };
}

export async function saveState(state: State): Promise<void> {
  const config = getConfig();
  await Bun.write(config.stateFilePath, JSON.stringify(state, null, 2));
}

export function isArticleSeen(state: State, url: string): boolean {
  const id = articleId(url);
  return id in state.seen;
}

export function markArticleSeen(
  state: State,
  url: string,
  metadata: Omit<SeenArticle, 'url' | 'postedAt'>
): State {
  const id = articleId(url);
  return {
    ...state,
    seen: {
      ...state.seen,
      [id]: {
        url,
        ...metadata,
        postedAt: new Date().toISOString(),
      },
    },
  };
}

export function isSourceAlerted(state: State, sourceName: string): boolean {
  return !!(state.alertedSources && state.alertedSources[sourceName]);
}

export function markSourceAlerted(state: State, sourceName: string): State {
  return {
    ...state,
    alertedSources: {
      ...state.alertedSources,
      [sourceName]: new Date().toISOString(),
    },
  };
}

export function clearSourceAlert(state: State, sourceName: string): State {
  if (!state.alertedSources) return state;
  const { [sourceName]: _, ...rest } = state.alertedSources;
  return {
    ...state,
    alertedSources: rest,
  };
}
