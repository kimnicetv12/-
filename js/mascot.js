/* 말랑이: 찹쌀떡 면접관 마스코트. 상태(state)에 따라 표정과 움직임이 바뀐다.
 * idle | talking | listening | thinking | happy | cheer | sad */
(function (root) {
  const SVG = `
<svg class="mascot-svg" viewBox="0 0 120 124" aria-hidden="true">
  <ellipse class="m-shadow" cx="60" cy="115" rx="42" ry="5"/>
  <g class="m-body">
    <g class="m-ring"><circle cx="60" cy="76" r="50"/></g>
    <path class="m-skin" d="M12 98C9 64 30 34 60 34s51 30 48 64c-1 10-13 14-48 14S13 108 12 98z"/>
    <g class="m-powder"><circle cx="30" cy="66" r="1.6"/><circle cx="88" cy="60" r="1.6"/><circle cx="72" cy="46" r="1.4"/><circle cx="46" cy="44" r="1.2"/><circle cx="95" cy="82" r="1.3"/></g>
    <ellipse class="m-shine" cx="40" cy="52" rx="10" ry="4.5" transform="rotate(-24 40 52)"/>
    <g class="m-brows"><path d="M38 63q7-4 14 0"/><path d="M68 63q7-4 14 0"/></g>
    <g class="m-eyes">
      <g class="m-pupils">
        <ellipse class="m-pupil" cx="46" cy="74" rx="4.4" ry="5.2"/>
        <ellipse class="m-pupil" cx="74" cy="74" rx="4.4" ry="5.2"/>
        <circle class="m-glint" cx="47.6" cy="71.8" r="1.5"/>
        <circle class="m-glint" cx="75.6" cy="71.8" r="1.5"/>
      </g>
      <g class="m-happy-eyes"><path d="M40 76q6-7 12 0"/><path d="M68 76q6-7 12 0"/></g>
    </g>
    <g class="m-glasses"><circle cx="46" cy="74" r="10"/><circle cx="74" cy="74" r="10"/><path d="M56 73h8"/></g>
    <ellipse class="m-blush" cx="33" cy="85" rx="7" ry="4"/>
    <ellipse class="m-blush" cx="87" cy="85" rx="7" ry="4"/>
    <path class="m-mouth smile" d="M55 85q5 5 10 0"/>
    <path class="m-mouth open" d="M53.5 84q6.5 11 13 0z"/>
    <path class="m-mouth flat" d="M55 88q5-2.5 10 0"/>
    <g class="m-tie"><path d="M56 101l4-3 4 3-4 3z"/><path d="M57.4 103.4h5.2l2 7.6-4.6 3-4.6-3z"/></g>
  </g>
  <g class="m-dots"><circle cx="98" cy="32" r="3"/><circle cx="106" cy="23" r="4"/><circle cx="114" cy="13" r="5"/></g>
  <g class="m-sparkles">
    <path d="M14 30l2 6 6 2-6 2-2 6-2-6-6-2 6-2z"/>
    <path d="M106 40l1.5 4.5 4.5 1.5-4.5 1.5-1.5 4.5-1.5-4.5-4.5-1.5 4.5-1.5z"/>
    <path d="M104 96l1.5 4.5 4.5 1.5-4.5 1.5-1.5 4.5-1.5-4.5-4.5-1.5 4.5-1.5z"/>
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
    if (el) el.dataset.state = state;
  }

  function setLevel(el, level) {
    if (el) el.style.setProperty('--level', Math.max(0, Math.min(1, level)).toFixed(3));
  }

  root.Mascot = { mount, setState, setLevel };
})(window);
