// 장면 화면 11종. 원칙: 바탕 위에 글자와 선만. 카드·그림자·둥근 상자·순차 페이드 없음.
// 움직임은 막대가 자라는 것과, 목록 항목이 말에 맞춰 하나씩 붙는 것만.
import React from 'react';
import type { Design, Format, Visual } from '../shared/types';
import { MediaView, useGrow, useReveal } from './parts';
import { FONT, fmtNum, type Layout, type Theme } from './theme';

interface VP { visual: Visual; theme: Theme; L: Layout; base: string; design: Design; format: Format }
type Of<K extends Visual['type']> = Extract<Visual, { type: K }>;

const T = (theme: Theme, size: number, weight = 600, color?: string): React.CSSProperties => ({
  fontFamily: FONT, fontSize: size, fontWeight: weight, color: color || theme.ink, lineHeight: 1.28,
  letterSpacing: size >= 60 ? '-0.025em' : '-0.01em', fontVariantNumeric: 'tabular-nums', wordBreak: 'keep-all',
});

/** 장면이 놓이는 영역. full 이면 화면 전체(쇼츠는 고정 제목 아래 전체) */
const Stage: React.FC<{ L: Layout; full?: boolean; center?: boolean; children: React.ReactNode }> = ({ L, full, center = true, children }) => {
  const b = full ? { x: 0, y: L.headline ? L.headline.h : 0, w: L.W, h: L.headline ? L.H - L.headline.h : L.H } : L.stage;
  return (
    <div style={{ position: 'absolute', left: b.x, top: b.y, width: b.w, height: b.h, display: 'flex', flexDirection: 'column', justifyContent: center ? 'center' : 'flex-start' }}>
      {children}
    </div>
  );
};

export const VisualView: React.FC<VP> = (p) => {
  const v = p.visual;
  switch (v.type) {
    case 'title': return <TitleV {...p} v={v} />;
    case 'media': return <MediaV {...p} v={v} />;
    case 'stat': return <StatV {...p} v={v} />;
    case 'bars': return <BarsV {...p} v={v} />;
    case 'table': return <TableV {...p} v={v} />;
    case 'quote': return <QuoteV {...p} v={v} />;
    case 'list': return <ListV {...p} v={v} />;
    case 'compare': return <CompareV {...p} v={v} />;
    case 'timeline': return <TimelineV {...p} v={v} />;
    case 'chapter': return <ChapterV {...p} v={v} />;
    case 'text': return <TextV {...p} v={v} />;
    default: return null;
  }
};

function TitleV({ v, theme, L, base, design }: VP & { v: Of<'title'> }) {
  const long = L.long;
  if (v.media?.src && theme.fullBleed) {
    return (
      <>
        <Stage L={L} full><MediaView media={v.media} base={base} drift={design.drift} theme={theme} style={{ width: '100%', height: '100%' }} /></Stage>
        <Stage L={L} full><div style={{ width: '100%', height: '100%', background: 'linear-gradient(180deg, rgba(0,0,0,0) 35%, rgba(0,0,0,0.78) 100%)' }} /></Stage>
        <Stage L={L} center={false}>
          <div style={{ marginTop: 'auto', maxWidth: long ? 1300 : '100%' }}>
            <div style={T(theme, long ? 92 : 80, 800, '#FFFFFF')}>{v.heading}</div>
            {v.sub && <div style={{ ...T(theme, 38, 500, 'rgba(255,255,255,0.75)'), marginTop: 18 }}>{v.sub}</div>}
          </div>
        </Stage>
      </>
    );
  }
  if (v.media?.src) {
    return (
      <Stage L={L}>
        <div style={{ display: 'flex', flexDirection: long ? 'row' : 'column', gap: long ? 72 : 44, alignItems: long ? 'center' : 'stretch', height: long ? '100%' : 'auto' }}>
          <div style={{ flex: long ? '0 0 44%' : '0 0 auto' }}>
            <div style={T(theme, long ? 80 : 72, 800)}>{v.heading}</div>
            {v.sub && <div style={{ ...T(theme, 36, 500, theme.muted), marginTop: 18 }}>{v.sub}</div>}
          </div>
          <MediaView media={v.media} base={base} drift={design.drift} theme={theme} style={{ flex: 1, alignSelf: 'stretch', minHeight: long ? 0 : 520, borderRadius: 4 }} />
        </div>
      </Stage>
    );
  }
  return (
    <Stage L={L}>
      <div style={{ maxWidth: long ? 1400 : '100%' }}>
        <div style={T(theme, long ? 100 : 86, 800)}>{v.heading}</div>
        {v.sub && <div style={{ ...T(theme, long ? 40 : 38, 500, theme.muted), marginTop: 24 }}>{v.sub}</div>}
      </div>
    </Stage>
  );
}

function MediaV({ v, theme, L, base, design }: VP & { v: Of<'media'> }) {
  const label = v.label ? (
    <div style={{ position: 'absolute', left: 0, bottom: 0, padding: '10px 20px', background: 'rgba(0,0,0,0.82)', ...T(theme, 28, 600, '#FFFFFF') }}>{v.label}</div>
  ) : null;
  return (
    <Stage L={L} full={theme.fullBleed}>
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
        <MediaView media={v.media} base={base} drift={design.drift} theme={theme} style={{ width: '100%', height: '100%', borderRadius: theme.fullBleed ? 0 : 4 }} />
        {label}
      </div>
    </Stage>
  );
}

/** 숫자 하나: 큰 숫자와 설명을 한 줄에 나란히 (가운데 정렬 큰 숫자 카드는 쓰지 않는다) */
function StatV({ v, theme, L }: VP & { v: Of<'stat'> }) {
  const long = L.long;
  const size = Math.min(long ? 180 : 150, Math.round((long ? 1500 : 900) / Math.max(3, v.value.length) * 1.1));
  return (
    <Stage L={L}>
      {v.before && <div style={{ ...T(theme, long ? 40 : 38, 600, theme.muted), marginBottom: 12 }}>{v.before}</div>}
      <div style={{ display: 'flex', flexDirection: long ? 'row' : 'column', alignItems: long ? 'baseline' : 'flex-start', gap: long ? 48 : 12 }}>
        <div style={{ ...T(theme, size, 800, theme.accent), lineHeight: 1, letterSpacing: '-0.04em', whiteSpace: 'nowrap' }}>{v.value}</div>
        <div style={{ ...T(theme, long ? 52 : 50, 700), maxWidth: long ? 760 : '100%' }}>{v.label}</div>
      </div>
    </Stage>
  );
}

function ChartHead({ theme, title, unit, long }: { theme: Theme; title?: string; unit?: string; long: boolean }) {
  if (!title && !unit) return null;
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: long ? 44 : 36 }}>
      <div style={T(theme, long ? 50 : 50, 800)}>{title}</div>
      {unit && <div style={T(theme, long ? 28 : 30, 500, theme.muted)}>단위: {unit}</div>}
    </div>
  );
}

function BarsV({ v, theme, L }: VP & { v: Of<'bars'> }) {
  const long = L.long;
  const items = v.items.slice(0, 12);
  const max = Math.max(...items.map((i) => Math.abs(i.value)), 1);
  const anyHi = items.some((i) => i.highlight);
  const horizontal = items.length > (long ? 7 : 5) || items.some((i) => i.label.length > (long ? 10 : 6));
  const g = useGrow(2, 10);
  const color = (hi?: boolean) => (hi || !anyHi ? theme.accent : theme.barRest);
  if (horizontal) {
    return (
      <Stage L={L}>
        <ChartHead theme={theme} title={v.title} unit={v.unit} long={long} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: long ? 18 : 22 }}>
          {items.map((it, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: `${long ? 320 : 250}px 1fr`, alignItems: 'center', gap: 24 }}>
              <div style={{ ...T(theme, long ? 32 : 34, 600), textAlign: 'right', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.label}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ height: long ? 36 : 40, width: `${(Math.abs(it.value) / max) * 80 * g}%`, background: color(it.highlight) }} />
                <div style={T(theme, long ? 32 : 36, 700, it.highlight || !anyHi ? theme.ink : theme.muted)}>{fmtNum(it.value)}</div>
              </div>
            </div>
          ))}
        </div>
      </Stage>
    );
  }
  const plotH = long ? 470 : 520;
  return (
    <Stage L={L}>
      <ChartHead theme={theme} title={v.title} unit={v.unit} long={long} />
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: long ? 56 : 32, height: plotH, borderBottom: `3px solid ${theme.ink}`, padding: '0 8px' }}>
        {items.map((it, i) => (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
            <div style={{ ...T(theme, long ? 44 : 46, 700, it.highlight || !anyHi ? theme.ink : theme.muted), marginBottom: 12 }}>{fmtNum(it.value)}</div>
            <div style={{ width: '64%', height: (Math.abs(it.value) / max) * (plotH - 90) * g, background: color(it.highlight) }} />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: long ? 56 : 32, padding: '18px 8px 0' }}>
        {items.map((it, i) => <div key={i} style={{ ...T(theme, long ? 34 : 34, 600, theme.muted), flex: 1, textAlign: 'center' }}>{it.label}</div>)}
      </div>
    </Stage>
  );
}

const isNumberish = (s: string) => /^[\s\d.,%+\-~약명개원억만천분초시간년월일배점위$₩]+$/.test(s) && /\d/.test(s);

function TableV({ v, theme, L }: VP & { v: Of<'table'> }) {
  const long = L.long;
  const rows = v.rows.slice(0, long ? 7 : 6);
  const fs = long ? (rows.length > 5 ? 38 : 42) : (v.columns.length > 3 ? 36 : 42);
  const align = (ci: number) => (ci > 0 && rows.every((r) => !r[ci] || isNumberish(r[ci])) ? 'right' : 'left') as 'left' | 'right';
  return (
    <Stage L={L}>
      {v.title && <div style={{ ...T(theme, 50, 800), marginBottom: 32 }}>{v.title}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: `1.3fr repeat(${Math.max(0, v.columns.length - 1)}, 1fr)` }}>
        {v.columns.map((c, ci) => (
          <div key={ci} style={{ ...T(theme, fs - 8, 600, theme.muted), padding: '0 18px 14px', borderBottom: `3px solid ${theme.ink}`, textAlign: align(ci) }}>{c}</div>
        ))}
        {rows.map((r, ri) => v.columns.map((_, ci) => {
          const hi = v.highlightRow === ri;
          return (
            <div key={`${ri}-${ci}`} style={{ ...T(theme, fs, hi ? 800 : 500, hi ? theme.accent : theme.ink), padding: `${long ? 18 : 20}px 18px`, borderBottom: `1.5px solid ${theme.rule}`, textAlign: align(ci) }}>{r[ci] ?? ''}</div>
          );
        }))}
      </div>
    </Stage>
  );
}

/** 기사 한 토막을 오려 붙인 모양 */
function QuoteV({ v, theme, L }: VP & { v: Of<'quote'> }) {
  const long = L.long;
  const len = v.text.length;
  const fs = long ? (len > 120 ? 40 : 48) : (len > 90 ? 42 : 50);
  return (
    <Stage L={L}>
      <div style={{ background: theme.sheet, padding: long ? '52px 64px' : '44px 44px' }}>
        {v.by && <div style={{ ...T(theme, long ? 30 : 32, 700, theme.muted), marginBottom: 24 }}>{v.by}</div>}
        <div style={{ ...T(theme, fs, 500), lineHeight: 1.62, letterSpacing: '-0.005em' }}>{v.text}</div>
      </div>
    </Stage>
  );
}

function ListV({ v, theme, L }: VP & { v: Of<'list'> }) {
  const long = L.long;
  const items = v.items.filter((x) => x.trim()).slice(0, 6);
  const shown = useReveal(items.length);
  return (
    <Stage L={L}>
      {v.title && <div style={{ ...T(theme, long ? 64 : 66, 800), marginBottom: long ? 36 : 32 }}>{v.title}</div>}
      <div style={{ borderTop: `3px solid ${theme.ink}` }}>
        {items.map((it, i) => (
          <div key={i} style={{ ...T(theme, long ? 48 : 52, 600), padding: long ? '22px 0' : '26px 0', borderBottom: `1.5px solid ${theme.rule}`, visibility: shown(i) ? 'visible' : 'hidden' }}>{it}</div>
        ))}
      </div>
    </Stage>
  );
}

function CompareV({ v, theme, L, base, design }: VP & { v: Of<'compare'> }) {
  const long = L.long;
  const side = (s: Of<'compare'>['left'], i: number) => (
    <div style={{ flex: 1, padding: long ? (i === 0 ? '0 56px 0 0' : '0 0 0 56px') : (i === 0 ? '0 0 36px' : '36px 0 0'), borderLeft: long && i === 1 ? `2px solid ${theme.rule}` : 'none', borderTop: !long && i === 1 ? `2px solid ${theme.rule}` : 'none' }}>
      {s.media?.src && <MediaView media={s.media} base={base} drift={false} theme={theme} style={{ height: long ? 300 : 230, marginBottom: 28, borderRadius: 4 }} />}
      <div style={{ ...T(theme, long ? 58 : 56, 800), marginBottom: 16 }}>{s.title}</div>
      {s.points.filter((x) => x.trim()).slice(0, 4).map((p, k) => (
        <div key={k} style={{ ...T(theme, long ? 40 : 44, 500, theme.ink), padding: '10px 0' }}>{p}</div>
      ))}
    </div>
  );
  return (
    <Stage L={L}>
      <div style={{ display: 'flex', flexDirection: long ? 'row' : 'column' }}>{side(v.left, 0)}{side(v.right, 1)}</div>
    </Stage>
  );
}

function TimelineV({ v, theme, L }: VP & { v: Of<'timeline'> }) {
  const long = L.long;
  const items = v.items.filter((x) => x.when || x.what).slice(0, long ? 6 : 5);
  const shown = useReveal(items.length);
  if (long) {
    return (
      <Stage L={L}>
        {v.title && <div style={{ ...T(theme, 60, 800), marginBottom: 72 }}>{v.title}</div>}
        <div style={{ display: 'flex', borderTop: `3px solid ${theme.ink}` }}>
          {items.map((it, i) => (
            <div key={i} style={{ flex: 1, paddingRight: 28, visibility: shown(i) ? 'visible' : 'hidden' }}>
              <div style={{ width: 3, height: 22, background: theme.ink }} />
              <div style={{ ...T(theme, 44, 800), marginTop: 18 }}>{it.when}</div>
              <div style={{ ...T(theme, 34, 500, theme.muted), marginTop: 10 }}>{it.what}</div>
            </div>
          ))}
        </div>
      </Stage>
    );
  }
  return (
    <Stage L={L}>
      {v.title && <div style={{ ...T(theme, 66, 800), marginBottom: 40 }}>{v.title}</div>}
      <div style={{ borderLeft: `3px solid ${theme.ink}`, paddingLeft: 40 }}>
        {items.map((it, i) => (
          <div key={i} style={{ padding: '18px 0', visibility: shown(i) ? 'visible' : 'hidden' }}>
            <div style={T(theme, 50, 800)}>{it.when}</div>
            <div style={{ ...T(theme, 44, 500, theme.muted), marginTop: 6 }}>{it.what}</div>
          </div>
        ))}
      </div>
    </Stage>
  );
}

function ChapterV({ v, theme, L }: VP & { v: Of<'chapter'> }) {
  const long = L.long;
  return (
    <Stage L={L}>
      <div style={{ ...T(theme, long ? 40 : 40, 700, theme.muted), marginBottom: 20 }}>{v.index}장</div>
      <div style={{ ...T(theme, long ? 104 : 88, 800), maxWidth: long ? 1400 : '100%' }}>{v.heading}</div>
    </Stage>
  );
}

function TextV({ v, theme, L }: VP & { v: Of<'text'> }) {
  const long = L.long;
  return (
    <Stage L={L}>
      <div style={{ maxWidth: long ? 1400 : '100%' }}>
        <div style={T(theme, long ? 78 : 72, 800)}>{v.heading}</div>
        {v.body && <div style={{ ...T(theme, long ? 42 : 42, 500, theme.muted), lineHeight: 1.55, marginTop: 28 }}>{v.body}</div>}
      </div>
    </Stage>
  );
}
