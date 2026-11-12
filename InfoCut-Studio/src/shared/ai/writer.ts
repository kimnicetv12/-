// 주제 탐구 · 대본 쓰기 · AI 수정
import type { Angle, Format, Project, Research, Scene, Visual } from '../types';
import { uid } from '../sample';
import { ask } from './llm';
import { http } from './net';
import type { Settings } from '../settings';

const VISUAL_GUIDE = `
화면 종류(visual)와 JSON 모양:
- title    {"type":"title","heading":"한 줄 제목","sub":"부제(선택)"}               영상 첫 장면, 큰 질문
- media    {"type":"media","label":"사진 위 짧은 이름표(선택)"}                     실제 모습·장소·제품·게임 화면을 보여줄 때. 이때 장면에 "query" 필수
- stat     {"type":"stat","value":"43%","label":"무엇의 숫자인지","before":"비교 전 값(선택)"}   핵심 숫자 하나
- bars     {"type":"bars","title":"제목","unit":"단위","items":[{"label":"항목","value":13,"highlight":true}]}   숫자 2~8개 비교. value 는 숫자만
- table    {"type":"table","title":"제목","columns":["항목","값1","값2"],"rows":[["A","1","2"]],"highlightRow":0}   여러 속성 비교, 행 6개 이하
- quote    {"type":"quote","text":"인용문","by":"말한 사람·매체"}                    기사·발언·공식 문서 인용
- list     {"type":"list","title":"제목","items":["요점1","요점2","요점3"]}           정리, 3~5개, 항목은 짧게
- compare  {"type":"compare","left":{"title":"A","points":["특징"]},"right":{"title":"B","points":["특징"]}}   둘 비교
- timeline {"type":"timeline","title":"제목","items":[{"when":"2016","what":"일어난 일"}]}   시간 순서, 3~6개
- chapter  {"type":"chapter","index":1,"heading":"장 제목"}                          롱폼에서 장이 바뀔 때만
- text     {"type":"text","heading":"핵심 문장","body":"보충 설명(선택)"}            개념 설명`;

const WRITING_RULES = `
대본 원칙 (정보 전달 채널):
- 말투는 친근한 존댓말("~요", "~죠"). 과장·낚시·감탄사 남발 금지. 사실을 또박또박 전한다.
- 한 장면 = 한두 문장. 쇼츠는 장면당 2~4초, 롱폼은 3~8초 분량.
- 숫자·날짜·인용은 반드시 탐구 노트에 있는 사실만 쓴다. 없는 숫자를 만들지 않는다. 불확실하면 "~로 알려져 있어요"처럼 말한다.
- 숫자나 인용을 보여주는 장면에는 "source" 에 짧은 출처를 쓴다 (예: "통계청 2025", "IGN 인터뷰").
- 화면 종류는 내용에 맞게 고른다. 같은 종류가 3번 넘게 연달아 나오지 않게 한다. 그림이 필요 없는 설명은 text·list 로.
- media 장면에는 사진을 찾을 "query" 를 영어 키워드로 쓴다 (예: "Seoul subway platform").
- 자막이 어색하게 끊길 문장은 끊을 자리에 " / " 를 넣는다.
- 영어 약어·외래어는 "say" 에 한글 발음을 쓴다 (예: text "GPU 가격이" → say "지피유 가격이").
- 첫 장면은 질문이나 핵심 사실로 바로 시작한다. 인사·채널 소개 없음.
- 마지막 장면은 한 줄 정리나 생각해 볼 질문. "구독·좋아요" 부탁은 넣지 않는다.

사람이 쓴 것처럼 들리게 (기계가 쓴 티가 나는 표현 금지):
- "~에 대해 알아보겠습니다", "함께 살펴볼까요", "지금부터 시작합니다" 같은 진행 멘트를 쓰지 않는다.
- "놀랍게도", "흥미롭게도", "사실은", "과연", "바로", "무려", "단순한 ~가 아니라" 같은 꾸밈말을 빼고 사실만 말한다.
- "여러분"으로 부르지 않는다. "결론적으로", "요약하자면", "이처럼", "뿐만 아니라", "또한"으로 문장을 시작하지 않는다.
- 셋씩 나열하는 버릇("빠르고, 쉽고, 편리한")과 같은 문장 구조의 반복을 피한다. 문장 길이를 섞는다.
- 질문하고 바로 답하는 형식("왜 그럴까요? 바로 ~ 때문입니다")은 영상 전체에서 한 번까지만.
- 교훈·당부·감상으로 끝내지 않는다. "~하는 것이 중요합니다", "~해 보는 건 어떨까요"를 쓰지 않는다.
- 뭉뚱그린 말("다양한", "여러 가지", "많은 사람들") 대신 탐구 노트에 있는 구체적인 이름과 숫자를 쓴다.
- 화면 글자(heading, label, items)는 명사로 짧게 끊는다. 문장부호와 이모지를 넣지 않는다.`;

function sceneFrom(o: any): Scene {
  const v: Visual = o.visual && typeof o.visual === 'object' && o.visual.type ? o.visual : { type: 'text', heading: String(o.text || '').slice(0, 30) };
  const s: Scene = { id: uid(), text: String(o.text || '').trim(), visual: v };
  if (o.say) s.say = String(o.say);
  if (o.source) s.source = String(o.source);
  if (o.query) s.query = String(o.query);
  if (o.note) s.note = String(o.note);
  if (v.type === 'bars') v.items = (v.items || []).map((i: any) => ({ label: String(i.label), value: Number(String(i.value).replace(/[^\d.-]/g, '')) || 0, highlight: !!i.highlight }));
  if (v.type === 'table') { v.columns = (v.columns || []).map(String); v.rows = (v.rows || []).map((r: any[]) => (r || []).map((c) => String(c))); }
  return s;
}

/* ---------- 1. 주제 탐구 ---------- */

export async function researchTopic(s: Settings, input: { topic: string; angleHint?: string; format: Format; memo?: string; urls?: string[] }, step: (m: string, p?: number) => void): Promise<Research> {
  step('참고 자료 읽는 중', 0.05);
  const extras: string[] = [];
  for (const url of (input.urls || []).filter(Boolean).slice(0, 5)) {
    try { extras.push(`[사용자가 준 자료] ${url}\n${await readPage(url)}`); } catch (e) { step(`읽지 못한 링크: ${url}`); }
  }
  try {
    const w = await wikipedia(input.topic);
    if (w) extras.push(`[위키백과] ${w.title} (${w.url})\n${w.extract}`);
  } catch { /* 위키는 보조 자료 */ }

  step('AI 가 웹에서 자료를 찾는 중 (1~2분)', 0.2);
  const system = `너는 유튜브 정보 영상의 리서처다. 주제에 대해 믿을 만한 자료를 찾아 사실을 정리한다.
- 공식 자료·통계·주요 언론·전문 매체를 우선한다. 커뮤니티 글은 반응을 보여줄 때만.
- 사실마다 출처 제목과 주소를 붙인다. 확인되지 않은 것은 넣지 않는다.
- 영상에 쓸 만한 숫자는 numbers 에 따로 모은다.
- 영상 방향(angles)을 3개 제안한다. 각각 시청자가 끝까지 볼 이유(hook)와 흐름(outline 4~7단계).`;
  const user = `주제: ${input.topic}
${input.angleHint ? `원하는 방향: ${input.angleHint}\n` : ''}${input.memo ? `메모: ${input.memo}\n` : ''}영상 형식: ${input.format === 'shorts' ? '쇼츠(1분 이하)' : '롱폼(5분 이상)'}
${extras.length ? `\n함께 볼 자료:\n${extras.join('\n\n').slice(0, 24000)}\n` : ''}
아래 JSON 으로 답해:
{"summary":"3~5문장 요약","facts":[{"text":"사실 한 문장","source":"출처 제목","url":"주소"}],"numbers":[{"label":"무엇","value":"값과 단위","source":"출처"}],"angles":[{"title":"방향 제목","hook":"끝까지 볼 이유","outline":["단계"]}]}
facts 는 8~20개.`;
  const r = await ask(s, { system, user, search: true, json: true, maxTokens: 12000 });
  step('탐구 노트 정리 중', 0.9);
  const d = r.data || {};
  const facts = (d.facts || []).map((f: any) => ({ text: String(f.text || ''), source: f.source ? String(f.source) : undefined, url: f.url ? String(f.url) : undefined, use: true })).filter((f: any) => f.text);
  const sources = [...r.sources];
  for (const f of facts) if (f.url && !sources.find((x) => x.url === f.url)) sources.push({ title: f.source || f.url, url: f.url });
  return {
    topic: input.topic,
    angleHint: input.angleHint,
    memo: input.memo,
    summary: String(d.summary || ''),
    facts,
    numbers: (d.numbers || []).map((n: any) => ({ label: String(n.label || ''), value: String(n.value || ''), source: n.source ? String(n.source) : undefined })),
    angles: (d.angles || []).map((a: any) => ({ title: String(a.title || ''), hook: String(a.hook || ''), outline: (a.outline || []).map(String) })),
    sources,
    chosenAngle: 0,
    createdAt: new Date().toISOString(),
  };
}

/* ---------- 2. 대본 쓰기 ---------- */

function researchBrief(r: Research, angle?: Angle) {
  const facts = r.facts.filter((f) => f.use).map((f, i) => `${i + 1}. ${f.text}${f.source ? ` (출처: ${f.source})` : ''}`).join('\n');
  const nums = r.numbers.map((n) => `- ${n.label}: ${n.value}${n.source ? ` (${n.source})` : ''}`).join('\n');
  return `주제: ${r.topic}
요약: ${r.summary}
${angle ? `방향: ${angle.title}\n끝까지 볼 이유: ${angle.hook}\n흐름: ${angle.outline.join(' → ')}\n` : ''}${r.memo ? `제작자 메모: ${r.memo}\n` : ''}
쓸 수 있는 사실:
${facts}
${nums ? `\n숫자:\n${nums}` : ''}`;
}

export interface ScriptOptions { seconds: number; tone?: string; extra?: string }

export async function writeScript(s: Settings, p: Project, opt: ScriptOptions, step: (m: string, pr?: number) => void): Promise<Partial<Project>> {
  if (!p.research) throw new Error('먼저 주제 탐구를 해 주세요.');
  const r = p.research;
  const angle = r.angles[r.chosenAngle ?? 0];
  const narr = p.narration.enabled ? '나레이션(목소리)이 읽는다.' : '목소리 없이 자막만 나온다. 자막만으로 이해되게 짧게 쓴다.';
  const chars = Math.round(opt.seconds * (p.narration.enabled ? 6.3 : 5.5));
  const system = `너는 정보 전달 유튜브 채널의 작가다. 탐구 노트를 바탕으로 장면별 대본을 쓴다.\n${WRITING_RULES}\n${VISUAL_GUIDE}`;
  const toneLine = opt.tone ? `\n말투·분위기 요청: ${opt.tone}` : '';
  const extraLine = opt.extra ? `\n추가 요청: ${opt.extra}` : '';

  if (p.format === 'shorts') {
    step('쇼츠 대본 쓰는 중', 0.2);
    const user = `${researchBrief(r, angle)}

쇼츠 대본을 써. 길이 약 ${opt.seconds}초 (문장 글자 수 합계 약 ${chars}자, 장면 ${Math.round(opt.seconds / 3)}개 안팎). ${narr}${toneLine}${extraLine}
JSON: {"title":"유튜브 제목(25자 이내)","headline":{"line1":"화면 위 제목 1줄(12자 이내)","line2":"2줄(12자 이내, 선택)"},"scenes":[{"text":"읽을 문장","visual":{...},"source":"선택","query":"media 일 때","say":"선택"}],"upload":{"title":"","description":"2~3문장 설명 + 참고 출처","tags":["태그"]}}`;
    const out = await ask(s, { system, user, json: true, maxTokens: 9000 });
    const d = out.data;
    return finalize(d, (d.scenes || []).map(sceneFrom));
  }

  // 롱폼: 목차 → 장별 대본
  step('롱폼 목차 짜는 중', 0.1);
  const chapterCount = Math.max(3, Math.min(8, Math.round(opt.seconds / 75)));
  const outline = await ask(s, {
    system: `너는 정보 전달 유튜브 채널의 작가다. 롱폼 영상의 목차를 짠다.\n${WRITING_RULES}`,
    user: `${researchBrief(r, angle)}\n\n약 ${Math.round(opt.seconds / 60)}분 롱폼의 목차를 ${chapterCount}장으로 짜. 첫 장은 도입(질문 제기), 마지막 장은 정리.${toneLine}${extraLine}
JSON: {"title":"유튜브 제목","headline":{"line1":"","line2":""},"chapters":[{"heading":"장 제목(15자 이내)","points":["이 장에서 다룰 내용"],"facts":[사실 번호들]}],"upload":{"title":"","description":"설명 + 챕터 목록 자리 + 참고 출처","tags":[]}}`,
    json: true, maxTokens: 4000,
  });
  const chapters: { heading: string; points: string[]; facts?: number[] }[] = outline.data.chapters || [];
  const perChapter = Math.round(chars / Math.max(chapters.length, 1));
  const scenes: Scene[] = [];
  for (let i = 0; i < chapters.length; i++) {
    const c = chapters[i];
    step(`${i + 1}/${chapters.length}장 쓰는 중: ${c.heading}`, 0.15 + (0.8 * i) / chapters.length);
    const prev = scenes.slice(-3).map((x) => x.text).join(' ');
    const out = await ask(s, {
      system,
      user: `${researchBrief(r, angle)}

전체 목차: ${chapters.map((x, k) => `${k + 1}. ${x.heading}`).join(' / ')}
지금 쓸 장: ${i + 1}장 "${c.heading}" — ${c.points.join(', ')}
${prev ? `바로 앞 문장들: ${prev}\n` : ''}이 장의 장면들을 써. 문장 글자 수 합계 약 ${perChapter}자. ${narr}
${i === 0 ? '첫 장면은 title 화면으로 영상 전체의 질문을 던진다. 그다음 장면은 chapter(index 1).' : `첫 장면은 chapter 화면(index ${i + 1}, heading "${c.heading}")으로 시작한다.`}
${i === chapters.length - 1 ? '마지막 장면은 정리 또는 생각해 볼 질문.' : ''}${toneLine}
JSON: {"scenes":[{"text":"","visual":{...},"source":"","query":"","say":""}]}`,
      json: true, maxTokens: 8000,
    });
    scenes.push(...(out.data.scenes || []).map(sceneFrom));
  }
  return finalize(outline.data, scenes);
}

function finalize(d: any, scenes: Scene[]): Partial<Project> {
  if (!scenes.length) throw new Error('AI 가 장면을 만들지 못했어요. 다시 시도해 주세요.');
  return {
    title: String(d.title || '').trim() || undefined,
    headline: { line1: String(d.headline?.line1 || d.title || '').trim(), line2: d.headline?.line2 ? String(d.headline.line2).trim() : undefined },
    scenes,
    upload: d.upload ? { title: String(d.upload.title || d.title || ''), description: String(d.upload.description || ''), tags: (d.upload.tags || []).map(String) } : undefined,
  };
}

/* ---------- 3. AI 수정 ---------- */

const compact = (sc: Scene[]) => sc.map((x) => ({ id: x.id, text: x.text, say: x.say, visual: x.visual, source: x.source, query: x.query }));

export async function reviseScript(s: Settings, p: Project, instruction: string, sceneIds?: string[]): Promise<Scene[]> {
  const target = sceneIds?.length ? p.scenes.filter((x) => sceneIds.includes(x.id)) : p.scenes;
  const system = `너는 정보 전달 유튜브 채널의 편집 작가다. 요청대로 대본을 고친다. 요청과 상관없는 장면은 그대로 둔다(id 유지).\n${WRITING_RULES}\n${VISUAL_GUIDE}`;
  const user = `${p.research ? researchBrief(p.research) + '\n\n' : ''}영상 형식: ${p.format === 'shorts' ? '쇼츠' : '롱폼'}
${sceneIds?.length ? `고칠 장면만 보낸다. 앞뒤 맥락:\n${p.scenes.map((x) => x.text).join(' ')}\n\n` : ''}현재 장면들:
${JSON.stringify(compact(target))}

요청: ${instruction}

고친 장면 목록을 JSON 으로: {"scenes":[{"id":"그대로 둔 장면은 원래 id, 새 장면은 빈 문자열","text":"","visual":{},"source":"","query":"","say":""}]}`;
  const out = await ask(s, { system, user, json: true, maxTokens: p.format === 'long' ? 16000 : 8000 });
  const keep = new Map(p.scenes.map((x) => [x.id, x]));
  const revised: Scene[] = (out.data.scenes || []).map((o: any) => {
    const old = o.id ? keep.get(o.id) : undefined;
    const fresh = sceneFrom(o);
    if (old) return { ...old, ...fresh, id: old.id, visual: mergeMedia(old.visual, fresh.visual) };
    return fresh;
  });
  if (!revised.length) throw new Error('AI 가 고친 장면을 보내지 않았어요.');
  if (!sceneIds?.length) return revised;
  // 선택한 장면 자리에 고친 장면을 끼워 넣는다
  const first = p.scenes.findIndex((x) => sceneIds.includes(x.id));
  const rest = p.scenes.filter((x) => !sceneIds.includes(x.id));
  const before = rest.filter((x) => p.scenes.indexOf(x) < first);
  const after = rest.filter((x) => p.scenes.indexOf(x) > first);
  return [...before, ...revised, ...after];
}

/** 화면 종류가 같으면 넣어 둔 사진은 살린다 */
function mergeMedia(oldV: Visual, newV: Visual): Visual {
  if (oldV.type === newV.type && 'media' in oldV && oldV.media && !('media' in newV && newV.media)) return { ...newV, media: oldV.media } as Visual;
  return newV;
}

export async function suggestVisual(s: Settings, p: Project, sceneId: string, instruction: string): Promise<Scene> {
  const i = p.scenes.findIndex((x) => x.id === sceneId);
  if (i < 0) throw new Error('장면을 찾을 수 없어요.');
  const cur = p.scenes[i];
  const system = `너는 정보 영상의 화면 디자이너 겸 작가다. 장면 하나를 다시 만든다.\n${WRITING_RULES}\n${VISUAL_GUIDE}`;
  const user = `${p.research ? researchBrief(p.research) + '\n\n' : ''}앞 장면: ${p.scenes[i - 1]?.text || '(없음)'}
지금 장면: ${JSON.stringify(compact([cur])[0])}
뒤 장면: ${p.scenes[i + 1]?.text || '(없음)'}

요청: ${instruction || '문장은 살리고 화면을 내용에 더 잘 맞게 바꿔 줘'}
JSON: {"text":"","visual":{},"source":"","query":"","say":""}`;
  const out = await ask(s, { system, user, json: true, maxTokens: 3000 });
  const fresh = sceneFrom(out.data);
  return { ...cur, ...fresh, id: cur.id, visual: mergeMedia(cur.visual, fresh.visual) };
}

/* ---------- 자료 읽기 ---------- */

export async function readPage(url: string): Promise<string> {
  const r = await http(url, { headers: { 'user-agent': 'Mozilla/5.0 InfoCutStudio' }, timeoutMs: 15000 });
  if (!r.ok) throw new Error(String(r.status));
  const html = await r.text();
  return html
    .replace(/<(script|style|noscript|svg|nav|footer|header)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/p>|<\/h\d>|<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim().slice(0, 8000);
}

async function wikipedia(topic: string) {
  const q = encodeURIComponent(topic);
  const r = await http(`https://ko.wikipedia.org/w/api.php?action=query&list=search&srsearch=${q}&srlimit=1&format=json&origin=*`, { timeoutMs: 8000 });
  const j = await r.json();
  const title = j.query?.search?.[0]?.title;
  if (!title) return null;
  const s = await http(`https://ko.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`, { timeoutMs: 8000 });
  const sj = await s.json();
  return { title, extract: String(sj.extract || ''), url: sj.content_urls?.desktop?.page || '' };
}
