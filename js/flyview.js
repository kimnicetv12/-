/* 초파리 뇌 그림: 투사뉴런 → 케년세포 2000개(켜진 100개 강조) → 출력뉴런 */
(function (root) {
  function color(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#999';
  }

  /** result: FlyBrain.evaluate() 결과 */
  function draw(canvas, result) {
    const FB = root.FlyBrain;
    const dpr = Math.min(2, root.devicePixelRatio || 1);
    const W = canvas.clientWidth || 520;
    const H = 168;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.height = `${H}px`;
    const g = canvas.getContext('2d');
    g.scale(dpr, dpr);
    g.clearRect(0, 0, W, H);

    const ink2 = color('--ink-2');
    const line = color('--line-2');
    const berry = color('--berry');
    const blue = color('--blueberry');
    const good = color('--mugwort');
    const bad = color('--bean');
    g.font = '11px Pretendard, sans-serif';
    g.textBaseline = 'middle';

    // 1) 투사뉴런 막대
    const pnY = 14;
    const pnH = 16;
    const labelW = 46;
    const pnW = (W - labelW - 6) / FB.N_PN;
    g.fillStyle = ink2;
    g.fillText('입력', 0, pnY + pnH / 2);
    result.pn.forEach((v, i) => {
      g.fillStyle = blue;
      g.globalAlpha = 0.25 + 0.75 * v;
      const h = Math.max(1.5, v * pnH);
      g.fillRect(labelW + i * pnW + 0.5, pnY + pnH - h, Math.max(1, pnW - 1), h);
    });
    g.globalAlpha = 1;

    // 2) 케년세포 격자 (100칸 × 20줄)
    const cols = 100;
    const rows = Math.ceil(FB.N_KC / cols);
    const gx = labelW;
    const gy = 44;
    const cw = (W - labelW - 6) / cols;
    const ch = 4.2;
    const active = new Set(result.active);
    g.fillStyle = ink2;
    g.fillText('케년세포', 0, gy + (rows * ch) / 2);

    // 가장 세게 켜진 세포 12개는 실제로 연결된 입력 7개까지 선을 그린다
    g.strokeStyle = berry;
    g.globalAlpha = 0.16;
    g.lineWidth = 0.6;
    result.active.slice().sort((a, b) => result.kcActivity[b] - result.kcActivity[a]).slice(0, 12).forEach((k) => {
      const x = gx + (k % cols) * cw + cw / 2;
      const y = gy + Math.floor(k / cols) * ch + ch / 2;
      for (const p of FB.wiringOf(k)) {
        g.beginPath();
        g.moveTo(labelW + p * pnW + pnW / 2, pnY + pnH);
        g.lineTo(x, y);
        g.stroke();
      }
    });
    g.globalAlpha = 1;

    for (let k = 0; k < FB.N_KC; k++) {
      const x = gx + (k % cols) * cw;
      const y = gy + Math.floor(k / cols) * ch;
      if (active.has(k)) {
        g.fillStyle = berry;
        g.fillRect(x, y - 0.6, Math.max(1.6, cw), ch + 0.6);
      } else {
        g.fillStyle = line;
        g.globalAlpha = 0.55;
        g.fillRect(x + cw * 0.2, y + ch * 0.25, Math.max(0.8, cw * 0.6), ch * 0.5);
        g.globalAlpha = 1;
      }
    }

    // 3) 출력뉴런: 항목마다 좋음/나쁨 줄다리기
    const oy = gy + rows * ch + 12;
    g.fillStyle = ink2;
    g.fillText('출력', 0, oy + 10);
    const names = ['적합성', '논리', '구체성', '직무', '전달력'];
    const slot = (W - labelW - 6) / names.length;
    names.forEach((n, i) => {
      const v = result.raw[i] / 10;
      const typed = i === 4 && result.scores.delivery == null;
      const x = labelW + i * slot;
      const bw = slot - 10;
      g.fillStyle = typed ? line : bad;
      g.fillRect(x, oy + 4, bw, 6);
      if (!typed) {
        g.fillStyle = good;
        g.fillRect(x, oy + 4, bw * v, 6);
      }
      g.fillStyle = ink2;
      g.fillText(n, x, oy + 20);
    });
  }

  root.FlyView = { draw };
})(window);
