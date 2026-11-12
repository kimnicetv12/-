// AI 연결: Claude(Anthropic) · Gemini(Google) · GPT(OpenAI)
// 세 회사 모두 "웹 검색" 도구를 켜서 최신 자료를 근거로 답하게 한다.
import type { Provider, Settings } from '../settings';
import { http } from './net';

export interface AskOptions {
  system: string;
  user: string;
  search?: boolean;
  maxTokens?: number;
  /** JSON 으로 답하게 하고 해석까지 한다 */
  json?: boolean;
}
export interface AskResult { text: string; data?: any; sources: { title: string; url: string }[]; model: string }

const LABEL: Record<Provider, string> = { anthropic: 'Claude', gemini: 'Gemini', openai: 'GPT' };

async function post(url: string, headers: Record<string, string>, body: unknown, provider: Provider) {
  const res = await http(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), timeoutMs: 300000 });
  const text = await res.text();
  if (!res.ok) {
    let msg = text.slice(0, 400);
    try { const j = JSON.parse(text); msg = j.error?.message || j.message || msg; } catch { /* 그대로 */ }
    if (res.status === 401 || res.status === 403) throw new Error(`${LABEL[provider]} 키가 맞지 않아요. 설정에서 키를 다시 넣어 주세요. (${msg})`);
    if (res.status === 404) throw new Error(`${LABEL[provider]} 모델을 찾을 수 없어요. 설정 > AI 에서 [모델 목록 불러오기]로 다른 모델을 고르세요. (${msg})`);
    if (res.status === 429) throw new Error(`${LABEL[provider]} 사용량 한도에 걸렸어요. 잠시 뒤 다시 하거나 다른 AI 를 고르세요. (${msg})`);
    throw new Error(`${LABEL[provider]} 오류 ${res.status}: ${msg}`);
  }
  return JSON.parse(text);
}

export async function ask(s: Settings, o: AskOptions): Promise<AskResult> {
  const provider = s.ai.provider;
  const key = s.keys[provider];
  if (!key) throw new Error(`${LABEL[provider]} 키가 없어요. 설정 > AI 에서 키를 넣어 주세요.`);
  const model = s.ai.models[provider] || (await pickDefaultModel(provider, key));
  const search = !!o.search && s.ai.webSearch;
  const system = o.json ? `${o.system}\n\n반드시 JSON 하나만 출력한다. 설명·코드블록 표시 없이.` : o.system;
  let out: AskResult;
  if (provider === 'anthropic') out = await askClaude(key, model, system, o, search);
  else if (provider === 'gemini') out = await askGemini(key, model, system, o, search);
  else out = await askOpenAI(key, model, system, o, search);
  if (o.json) out.data = parseJson(out.text);
  return out;
}

async function askClaude(key: string, model: string, system: string, o: AskOptions, search: boolean): Promise<AskResult> {
  const body: any = { model, max_tokens: o.maxTokens || 8000, system, messages: [{ role: 'user', content: o.user }] };
  if (search) body.tools = [{ type: 'web_search_20250305', name: 'web_search', max_uses: 8 }];
  const j = await post('https://api.anthropic.com/v1/messages', { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' }, body, 'anthropic');
  const sources: AskResult['sources'] = [];
  let text = '';
  for (const b of j.content || []) {
    if (b.type === 'text') {
      text += b.text;
      for (const c of b.citations || []) if (c.url) sources.push({ title: c.title || c.url, url: c.url });
    }
    if (b.type === 'web_search_tool_result' && Array.isArray(b.content)) for (const r of b.content) if (r.url) sources.push({ title: r.title || r.url, url: r.url });
  }
  return { text, sources: dedupe(sources), model };
}

async function askGemini(key: string, model: string, system: string, o: AskOptions, search: boolean): Promise<AskResult> {
  const body: any = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: o.user }] }],
    generationConfig: { maxOutputTokens: o.maxTokens || 8000, temperature: 0.7 },
  };
  if (search) body.tools = [{ google_search: {} }];
  else if (o.json) body.generationConfig.responseMimeType = 'application/json';
  const j = await post(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, {}, body, 'gemini');
  const cand = j.candidates?.[0];
  const text = (cand?.content?.parts || []).map((p: any) => p.text || '').join('');
  const sources = (cand?.groundingMetadata?.groundingChunks || []).filter((c: any) => c.web?.uri).map((c: any) => ({ title: c.web.title || c.web.uri, url: c.web.uri }));
  if (!text) throw new Error(`Gemini 가 빈 답을 보냈어요 (${cand?.finishReason || '이유 모름'}). 다시 시도해 주세요.`);
  return { text, sources: dedupe(sources), model };
}

async function askOpenAI(key: string, model: string, system: string, o: AskOptions, search: boolean): Promise<AskResult> {
  const body: any = { model, instructions: system, input: o.user, max_output_tokens: o.maxTokens || 8000 };
  if (search) body.tools = [{ type: 'web_search' }];
  const j = await post('https://api.openai.com/v1/responses', { authorization: `Bearer ${key}` }, body, 'openai');
  let text = '';
  const sources: AskResult['sources'] = [];
  for (const item of j.output || []) {
    if (item.type !== 'message') continue;
    for (const c of item.content || []) {
      if (c.type === 'output_text') {
        text += c.text;
        for (const a of c.annotations || []) if (a.type === 'url_citation' && a.url) sources.push({ title: a.title || a.url, url: a.url });
      }
    }
  }
  return { text, sources: dedupe(sources), model };
}

/* ---------- 모델 목록 ---------- */

export async function listModels(provider: Provider, key: string): Promise<string[]> {
  if (!key) throw new Error('키를 먼저 넣어 주세요.');
  if (provider === 'anthropic') {
    const r = await http('https://api.anthropic.com/v1/models?limit=100', { headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' } });
    if (!r.ok) throw new Error(`Claude 모델 목록 오류 ${r.status}`);
    const j = await r.json();
    return (j.data || []).map((m: any) => m.id);
  }
  if (provider === 'gemini') {
    const r = await http(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=${encodeURIComponent(key)}`);
    if (!r.ok) throw new Error(`Gemini 모델 목록 오류 ${r.status}`);
    const j = await r.json();
    return (j.models || [])
      .filter((m: any) => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map((m: any) => String(m.name).replace(/^models\//, ''))
      .filter((n: string) => /gemini/.test(n) && !/(embedding|image|tts|audio|live|vision)/.test(n));
  }
  const r = await http('https://api.openai.com/v1/models', { headers: { authorization: `Bearer ${key}` } });
  if (!r.ok) throw new Error(`OpenAI 모델 목록 오류 ${r.status}`);
  const j = await r.json();
  return (j.data || []).map((m: any) => m.id).filter((n: string) => /^(gpt|o\d)/.test(n) && !/(audio|realtime|tts|transcribe|image|search|embedding)/.test(n)).sort().reverse();
}

const PREFER: Record<Provider, RegExp[]> = {
  anthropic: [/sonnet/, /opus/, /haiku/],
  gemini: [/flash(?!.*lite)/, /pro/, /flash/],
  openai: [/^gpt-\d+(\.\d+)?$/, /^gpt-\d/, /^o\d/],
};

const cache = new Map<string, string>();
export async function pickDefaultModel(provider: Provider, key: string): Promise<string> {
  const c = cache.get(provider + key);
  if (c) return c;
  const all = await listModels(provider, key);
  const sorted = [...all].sort(versionDesc);
  for (const re of PREFER[provider]) {
    const hit = sorted.find((m) => re.test(m) && !/(preview|exp|latest)$/.test(m)) || sorted.find((m) => re.test(m));
    if (hit) { cache.set(provider + key, hit); return hit; }
  }
  if (!sorted[0]) throw new Error('쓸 수 있는 모델이 없어요.');
  return sorted[0];
}

function versionDesc(a: string, b: string) {
  const na = (a.match(/\d+(\.\d+)?/g) || []).map(Number);
  const nb = (b.match(/\d+(\.\d+)?/g) || []).map(Number);
  for (let i = 0; i < Math.max(na.length, nb.length); i++) {
    const d = (nb[i] ?? 0) - (na[i] ?? 0);
    if (d) return d;
  }
  return a.length - b.length;
}

/* ---------- 도우미 ---------- */

export function parseJson(text: string): any {
  let t = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try { return JSON.parse(t); } catch { /* 아래로 */ }
  const first = t.search(/[[{]/);
  if (first < 0) throw new Error('AI 답에서 JSON 을 찾지 못했어요. 다시 시도해 주세요.');
  const open = t[first];
  const close = open === '{' ? '}' : ']';
  let depth = 0, inStr = false, esc = false;
  for (let i = first; i < t.length; i++) {
    const ch = t[i];
    if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true;
    else if (ch === open) depth++;
    else if (ch === close && --depth === 0) {
      t = t.slice(first, i + 1);
      try { return JSON.parse(t); } catch { return JSON.parse(t.replace(/,\s*([}\]])/g, '$1')); }
    }
  }
  throw new Error('AI 답의 JSON 이 중간에 끊겼어요. 다시 시도하거나 길이를 줄여 주세요.');
}

function dedupe(list: { title: string; url: string }[]) {
  const seen = new Set<string>();
  return list.filter((s) => (seen.has(s.url) ? false : (seen.add(s.url), true)));
}
