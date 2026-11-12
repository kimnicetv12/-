import type { Preset } from './types';

export type Provider = 'anthropic' | 'gemini' | 'openai';

export interface Settings {
  ai: { provider: Provider; models: Record<Provider, string>; webSearch: boolean };
  keys: { anthropic: string; gemini: string; openai: string; elevenlabs: string; pexels: string; pixabay: string };
  python: string;
  assetFolders: string[];
  defaults: { narration: boolean; voice: string; rate: string; preset: Preset; accent: string };
  render: { crf: number; concurrency: number | null };
}

export function defaultSettings(assetFolders: string[] = []): Settings {
  return {
    ai: { provider: 'anthropic', models: { anthropic: '', gemini: '', openai: '' }, webSearch: true },
    keys: { anthropic: '', gemini: '', openai: '', elevenlabs: '', pexels: '', pixabay: '' },
    python: '',
    assetFolders,
    defaults: { narration: true, voice: 'ko-KR-InJoonNeural', rate: '+8%', preset: 'paper', accent: '#1F5FD1' },
    render: { crf: 18, concurrency: null },
  };
}

export function mergeSettings(base: Settings, saved: any): Settings {
  if (!saved) return base;
  return {
    ...base, ...saved,
    ai: { ...base.ai, ...saved.ai, models: { ...base.ai.models, ...saved.ai?.models } },
    keys: { ...base.keys, ...saved.keys },
    defaults: { ...base.defaults, ...saved.defaults },
    render: { ...base.render, ...saved.render },
  };
}

export function publicSettings(s: Settings) {
  const mask = (k: string) => (k ? `${k.slice(0, 4)}••••${k.slice(-4)}` : '');
  return { ...s, keys: Object.fromEntries(Object.entries(s.keys).map(([k, v]) => [k, mask(v)])), hasKey: Object.fromEntries(Object.entries(s.keys).map(([k, v]) => [k, !!v])) };
}
