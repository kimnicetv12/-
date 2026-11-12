import { useEffect, useState } from 'react';
import { LOCAL, api } from '../api';

type Provider = 'anthropic' | 'gemini' | 'openai';
const PROVIDERS: { id: Provider; name: string; keyUrl: string }[] = [
  { id: 'anthropic', name: 'Claude', keyUrl: 'https://console.anthropic.com/settings/keys' },
  { id: 'gemini', name: 'Gemini', keyUrl: 'https://aistudio.google.com/apikey' },
  { id: 'openai', name: 'GPT', keyUrl: 'https://platform.openai.com/api-keys' },
];
const EXTRA: { id: string; name: string; keyUrl: string }[] = [
  { id: 'elevenlabs', name: 'ElevenLabs (목소리)', keyUrl: 'https://elevenlabs.io/app/settings/api-keys' },
  { id: 'pexels', name: 'Pexels (사진, 영상)', keyUrl: 'https://www.pexels.com/api/' },
  { id: 'pixabay', name: 'Pixabay (사진)', keyUrl: 'https://pixabay.com/api/docs/' },
];

export function SettingsPage() {
  const [s, setS] = useState<any>(null);
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [models, setModels] = useState<Record<string, string[]>>({});
  const [err, setErr] = useState('');
  const [voice, setVoice] = useState<any>(null);

  useEffect(() => { api<any>('/api/state').then((st) => { setS(st.settings); setVoice(st.voice); }).catch((e) => setErr(e.message)); }, []);
  if (!s) return err ? <p className="msg err">{err}</p> : null;

  const save = async (patch: any) => {
    setErr('');
    try { setS((await api<any>('/api/settings', { body: patch })).settings); setKeys({}); }
    catch (e) { setErr((e as Error).message); }
  };
  const loadModels = async (p: Provider) => {
    setErr('');
    try { const r = await api<any>(`/api/models/${p}`); setModels((m) => ({ ...m, [p]: r.models })); }
    catch (e) { setErr((e as Error).message); }
  };
  const prov = s.ai.provider as Provider;
  const keyRow = (id: string, name: string, keyUrl: string) => (
    <div key={id} className="f">
      <label>{name} 키{s.hasKey[id] && <em>저장됨</em>}<a href={keyUrl} target="_blank" rel="noreferrer">발급</a></label>
      <div className="row nowrap">
        <input className="in grow" type="password" autoComplete="off" placeholder={s.keys[id] || ''} value={keys[id] || ''} onChange={(e) => setKeys({ ...keys, [id]: e.target.value })} />
        <button className="btn" disabled={!keys[id]} onClick={() => save({ keys: { [id]: keys[id] } })}>저장</button>
      </div>
    </div>
  );

  return (
    <div className="narrow">
      <div className="head"><h1>설정</h1></div>
      {err && <p className="msg err">{err}</p>}

      <h2>AI</h2>
      <div className="f">
        <label>사용할 AI</label>
        <div className="seg">{PROVIDERS.map((p) => <button key={p.id} aria-pressed={prov === p.id} onClick={() => save({ ai: { provider: p.id } })}>{p.name}</button>)}</div>
      </div>
      {PROVIDERS.map((p) => (
        <div key={p.id}>
          {keyRow(p.id, p.name, p.keyUrl)}
          {s.hasKey[p.id] && (
            <div className="f">
              <label>{p.name} 모델</label>
              <div className="row nowrap">
                <select className="in grow" value={s.ai.models[p.id] || ''} onChange={(e) => save({ ai: { models: { [p.id]: e.target.value } } })}>
                  <option value="">자동</option>
                  {s.ai.models[p.id] && !(models[p.id] || []).includes(s.ai.models[p.id]) && <option value={s.ai.models[p.id]}>{s.ai.models[p.id]}</option>}
                  {(models[p.id] || []).map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
                <button className="btn" onClick={() => loadModels(p.id)}>목록</button>
              </div>
            </div>
          )}
        </div>
      ))}
      <label className="chk"><input type="checkbox" checked={s.ai.webSearch} onChange={(e) => save({ ai: { webSearch: e.target.checked } })} />조사할 때 웹 검색 사용</label>

      <h2>목소리, 사진</h2>
      {!LOCAL && <p className="msg">edge-tts: {voice?.edge ? '사용 가능' : voice?.python ? '설치 안 됨 (설치.bat 다시 실행)' : '파이썬 없음'}</p>}
      {EXTRA.map((k) => keyRow(k.id, k.name, k.keyUrl))}
      {!LOCAL && (
        <div className="f">
          <label>파이썬 경로</label>
          <input className="in" placeholder={voice?.python || '자동'} defaultValue={s.python} onBlur={(e) => save({ python: e.target.value.trim() })} />
        </div>
      )}

      {!LOCAL && (
        <>
          <h2>렌더</h2>
          <div className="grid2">
            <div className="f"><label>화질 (CRF)</label>
              <select className="in" value={s.render.crf} onChange={(e) => save({ render: { crf: Number(e.target.value) } })}>
                <option value={14}>14 (높음)</option><option value={18}>18 (기본)</option><option value={23}>23 (빠름)</option>
              </select>
            </div>
            <div className="f"><label>동시 프레임 수</label>
              <select className="in" value={s.render.concurrency ?? ''} onChange={(e) => save({ render: { concurrency: e.target.value ? Number(e.target.value) : null } })}>
                <option value="">자동</option><option value={2}>2</option><option value={4}>4</option><option value={8}>8</option>
              </select>
            </div>
          </div>
        </>
      )}
      <p className="msg">{LOCAL ? '키는 이 휴대폰에만 저장됩니다.' : '키는 data/settings.json 에만 저장됩니다.'}</p>
    </div>
  );
}
