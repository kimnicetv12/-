// Small SVG pictograms for pace notes (corner severity, hairpins, crests).

const STROKE = 'stroke="#0d1114" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"';

function arrowHead(x, y, angle) {
  const a1 = angle + 2.6, a2 = angle - 2.6, L = 11;
  return `<path d="M${x + Math.cos(a1) * L} ${y + Math.sin(a1) * L} L${x} ${y} L${x + Math.cos(a2) * L} ${y + Math.sin(a2) * L}" ${STROKE}/>`;
}

export function noteIcon(n) {
  if (n.type === 'corner') {
    const sgn = n.dir === 'R' ? 1 : -1;
    if (n.grade === 'H') {
      const x0 = 32 - sgn * 10, x1 = 32 + sgn * 10;
      return `<svg viewBox="0 0 64 64">${`<path d="M${x0} 58 L${x0} 26 A10 10 0 0 ${sgn > 0 ? 1 : 0} ${x1} 26 L${x1} 40" ${STROKE}/>`}${arrowHead(x1, 42, Math.PI / 2)}</svg>`;
    }
    const g = n.grade; // 1 (slowest) .. 6 (fastest)
    const bend = (7 - g) / 6; // 1 = sharp
    const ang = (-Math.PI / 2) + sgn * (0.35 + bend * 1.35);
    const len = 26;
    const cx = 32, cy = 34;
    const ex = cx + Math.cos(ang) * len, ey = cy + Math.sin(ang) * len;
    const ctrlX = cx, ctrlY = cy - 10 - bend * 4;
    return `<svg viewBox="0 0 64 64"><path d="M32 60 L32 ${cy} Q${ctrlX} ${ctrlY} ${ex} ${ey}" ${STROKE}/>${arrowHead(ex, ey, Math.atan2(ey - ctrlY, ex - ctrlX))}</svg>`;
  }
  if (n.type === 'crest') return `<svg viewBox="0 0 64 64"><path d="M4 48 Q32 6 60 48" ${STROKE}/></svg>`;
  if (n.type === 'jump') {
    return `<svg viewBox="0 0 64 64"><path d="M2 54 Q20 26 30 40" ${STROKE}/><path d="M40 56 L62 56" ${STROKE}/><path d="M24 22 Q36 8 50 26" stroke="#c8102e" stroke-width="5" fill="none" stroke-linecap="round" stroke-dasharray="2 8"/></svg>`;
  }
  // finish: chequered flag
  let sq = '';
  for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) if ((r + c) % 2 === 0) sq += `<rect x="${16 + c * 8}" y="${10 + r * 7}" width="8" height="7" fill="#0d1114"/>`;
  return `<svg viewBox="0 0 64 64"><rect x="16" y="10" width="40" height="28" fill="#fff" stroke="#0d1114" stroke-width="2"/>${sq}<path d="M14 8 L14 60" ${STROKE}/></svg>`;
}

export function noteLabel(n) {
  if (n.type === 'corner') return n.grade === 'H' ? 'HP' : String(n.grade);
  if (n.type === 'crest') return '';
  if (n.type === 'jump') return '';
  return '';
}

export function noteMods(n) {
  const m = [];
  if (n.type === 'corner') {
    m.push(n.dir === 'L' ? '왼쪽' : '오른쪽');
    if (n.grade === 'H') m.push('헤어핀');
    if (n.mods.includes('long')) m.push('롱');
    if (n.mods.includes('tightens')) m.push('조여짐');
    if (n.mods.includes('opens')) m.push('열림');
  } else if (n.type === 'crest') m.push('크레스트');
  else if (n.type === 'jump') m.push(n.name ? `점프 · ${n.name}` : '점프');
  else m.push('피니시');
  if (n.into) m.push('→ 이어서');
  return m.join(' ');
}
