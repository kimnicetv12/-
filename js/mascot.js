/* 말랑이: 면접관 마스코트. 상태(state)에 따라 표정과 움직임이 바뀐다.
 * idle | talking | listening | thinking | happy | cheer | sad */
(function (root) {
  const SVG = `
<svg class="mascot-svg" viewBox="0 0 120 124" aria-hidden="true">
  <ellipse class="m-shadow" cx="60" cy="116" rx="34" ry="5"/>
  <g class="m-body">
    <g class="m-ring"><circle cx="60" cy="62" r="50"/></g>
    <path class="m-skin" d="M60 14C90 14 106 36 106 64c0 30-20 46-46 46S14 94 14 64C14 36 30 14 60 14z"/>
    <path class="m-belly" d="M60 70c18 0 30 8 30 20 0 10-14 16-30 16s-30-6-30-16c0-12 12-20 30-20z"/>
    <ellipse class="m-shine" cx="38" cy="32" rx="10" ry="6" transform="rotate(-30 38 32)"/>
    <ellipse class="m-shine small" cx="52" cy="24" rx="3" ry="2"/>
    <g class="m-brows">
      <path d="M34 42q8-5 16 0"/><path d="M70 42q8-5 16 0"/>
    </g>
    <g class="m-eyes">
      <circle class="m-white" cx="44" cy="56" r="12"/>
      <circle class="m-white" cx="76" cy="56" r="12"/>
      <g class="m-pupils">
        <circle class="m-pupil" cx="45" cy="57" r="6.5"/>
        <circle class="m-pupil" cx="77" cy="57" r="6.5"/>
        <circle class="m-glint" cx="47.5" cy="54.5" r="2.2"/>
        <circle class="m-glint" cx="79.5" cy="54.5" r="2.2"/>
      </g>
      <g class="m-happy-eyes"><path d="M35 58q9-10 18 0"/><path d="M67 58q9-10 18 0"/></g>
    </g>
    <g class="m-glasses"><circle cx="44" cy="56" r="14"/><circle cx="76" cy="56" r="14"/><path d="M58 56h4"/></g>
    <ellipse class="m-blush" cx="31" cy="72" rx="7" ry="4"/>
    <ellipse class="m-blush" cx="89" cy="72" rx="7" ry="4"/>
    <path class="m-mouth smile" d="M51 76q9 9 18 0"/>
    <path class="m-mouth open" d="M50 75q10 16 20 0z"/>
    <path class="m-mouth flat" d="M52 79q8-4 16 0"/>
    <g class="m-tie"><path d="M55 98l5-4 5 4-5 4z"/><path d="M57 101h6l3 10-6 4-6-4z"/></g>
  </g>
  <g class="m-dots"><circle cx="96" cy="20" r="3"/><circle cx="104" cy="13" r="4"/><circle cx="113" cy="5" r="5"/></g>
  <g class="m-sparkles">
    <path d="M14 20l2 6 6 2-6 2-2 6-2-6-6-2 6-2z"/>
    <path d="M104 30l1.5 4.5 4.5 1.5-4.5 1.5-1.5 4.5-1.5-4.5-4.5-1.5 4.5-1.5z"/>
    <path d="M100 92l1.5 4.5 4.5 1.5-4.5 1.5-1.5 4.5-1.5-4.5-4.5-1.5 4.5-1.5z"/>
  </g>
</svg>`;

  function mount(el, { state = 'idle', glasses = false } = {}) {
    el.classList.add('mascot');
    el.innerHTML = SVG;
    el.dataset.state = state;
    el.classList.toggle('with-glasses', glasses);
    return el;
  }

  function setState(el, state) {
    if (!el) return;
    el.dataset.state = state;
  }

  function setLevel(el, level) {
    if (!el) return;
    el.style.setProperty('--level', Math.max(0, Math.min(1, level)).toFixed(3));
  }

  root.Mascot = { mount, setState, setLevel };
})(window);
