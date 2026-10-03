/* Planora landing: animated "prompt → 2D plan → 3D" story.
   Replaces the static cards in section.lp-process (.lp-process-track) once the landing app renders. */
(() => {
  const PROMPT = 'A 2-bedroom home with an open kitchen, a study and one bath on a 12 × 9 m plot';
  const CHIPS = ['2 bedrooms', 'Open kitchen', 'Study', '1 bath', '108 m²'];
  // Plan in units of 3 cm (400 × 300 = 12 × 9 m): name, x, y, w, h, floor colour.
  const ROOMS = [
    ['Living', 0, 0, 200, 170, '#EADBC8'], ['Kitchen', 200, 0, 120, 120, '#E2EAE3'], ['Bath', 320, 0, 80, 120, '#D6E5EC'],
    ['Bedroom', 200, 120, 200, 180, '#EFE2D1'], ['Bedroom 2', 0, 170, 120, 130, '#F1E7DA'], ['Study', 120, 170, 80, 130, '#E5E2EE'],
  ];
  const OUTER = [[0, 0, 400, 0], [400, 0, 400, 300], [400, 300, 0, 300], [0, 300, 0, 0]];
  const INNER = [[200, 0, 200, 300], [200, 120, 400, 120], [320, 0, 320, 120], [0, 170, 200, 170], [120, 170, 120, 300]];
  const DOORS = [[60, 170, 1], [240, 120, 1], [340, 120, 1], [150, 170, 1], [200, 40, 0]];
  const FURNITURE = [ // x, y, w, h, colour
    [30, 118, 120, 34, '#7E9C84'], [65, 62, 56, 30, '#B98B62'], [262, 186, 92, 104, '#FBFAF7'], [262, 186, 92, 20, '#A9BFD6'],
    [20, 204, 72, 82, '#FBFAF7'], [205, 5, 110, 22, '#C9C3BA'], [232, 60, 54, 26, '#B98B62'], [330, 10, 62, 32, '#FFFFFF'], [130, 262, 60, 24, '#8B6A50'],
  ];
  const S = 0.65; // plan → 3D pixels
  // Richer 3D finishes per room: oak planks, tiled wet rooms, carpet in the study.
  const tiles = (line, base) => `linear-gradient(#0000 9px, ${line} 9px 10px) 0 0/10px 10px, linear-gradient(90deg, #0000 9px, ${line} 9px 10px) 0 0/10px 10px, ${base}`;
  const planks = (a, b) => `repeating-linear-gradient(90deg, ${a} 0 11px, ${b} 11px 12px)`;
  const FLOOR3D = {
    Living: planks('#D3A672', '#B98A57'), Kitchen: tiles('#A9BFAE', '#DCE8DE'), Bath: tiles('#9DBCCF', '#D3E4EE'),
    Bedroom: planks('#DDB98E', '#C69E70'), 'Bedroom 2': planks('#E2C29C', '#CCA67C'), Study: '#CFC5E0',
  };
  const FURN3D = ['#52765B', '#C96F4A', '#FFFFFF', '#7FA3C6', '#FFFFFF', '#8F8A82', '#9C6B45', '#F4F7F9', '#6B4A35'];
  const WAIT = '<div class="pf-wait"><span></span>Waiting for your brief…</div>';

  const el = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
  const arrow = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
  const area = (w, h) => `${((w * 0.03) * (h * 0.03)).toFixed(1)} m²`;

  function planSvg() {
    const rooms = ROOMS.map(([n, x, y, w, h, c]) =>
      `<rect class="pf-room" x="${x + 20}" y="${y + 30}" width="${w}" height="${h}" fill="${c}"/>`).join('');
    const labels = ROOMS.map(([n, x, y, w, h]) =>
      `<text class="pf-label" x="${x + 20 + w / 2}" y="${y + 30 + h / 2}">${n}<tspan class="pf-area" x="${x + 20 + w / 2}" dy="13">${area(w, h)}</tspan></text>`).join('');
    const seg = (s, cls) => s.map(([x1, y1, x2, y2]) => `<path class="pf-wall ${cls}" pathLength="1" d="M${x1 + 20} ${y1 + 30}L${x2 + 20} ${y2 + 30}"/>`).join('');
    const doors = DOORS.map(([x, y, horiz]) => horiz
      ? `<path class="pf-door" pathLength="1" d="M${x + 20} ${y + 30}v-22a22 22 0 0 1 22 22"/>`
      : `<path class="pf-door" pathLength="1" d="M${x + 20} ${y + 30}h22a22 22 0 0 1-22 22"/>`).join('');
    return `<svg viewBox="0 0 440 345" role="img" aria-label="Generated floor plan with six rooms">
      <defs><linearGradient id="pf-scan" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#52765B" stop-opacity="0"/><stop offset="1" stop-color="#52765B" stop-opacity=".35"/></linearGradient></defs>
      <g class="pf-dim"><line x1="20" y1="14" x2="420" y2="14"/><line x1="20" y1="9" x2="20" y2="19"/><line x1="420" y1="9" x2="420" y2="19"/><rect x="198" y="5" width="44" height="16" fill="#fff"/><text x="220" y="17">12.0 m</text></g>
      ${rooms}${seg(INNER, 'pf-inner')}${seg(OUTER, '')}${doors}${labels}
      <rect class="pf-scan" x="20" y="10" width="400" height="24" fill="url(#pf-scan)"/>
    </svg>`;
  }

  function world() {
    const w = el('div', 'pf-world');
    w.appendChild(el('div', 'pf-ground'));
    for (const [n, x, y, wd, h, c] of ROOMS) {
      const f = el('div', 'pf-floor');
      Object.assign(f.style, { left: `${x * S}px`, top: `${y * S}px`, width: `${wd * S}px`, height: `${h * S}px`, background: FLOOR3D[n] || c });
      w.appendChild(f);
    }
    const walls = [...OUTER.map(s => [...s, 46]), ...INNER.map(s => [...s, 38])];
    walls.forEach(([x1, y1, x2, y2, H], i) => {
      const horiz = y1 === y2;
      const len = Math.abs(horiz ? x2 - x1 : y2 - y1) * S;
      const box = el('div', 'pf-wall3');
      Object.assign(box.style, {
        left: `${Math.min(x1, x2) * S}px`, top: `${Math.min(y1, y2) * S}px`, width: `${len}px`, height: `${H}px`,
        transformOrigin: '0 0', transform: horiz ? 'rotateX(90deg)' : 'rotateZ(90deg) rotateX(90deg)',
      });
      const face = el('div', 'pf-face');
      Object.assign(face.style, { width: `${len}px`, height: `${H}px`, transitionDelay: `${i * 70}ms`,
        background: horiz ? 'linear-gradient(#FFFFFF,#EEE8DF)' : 'linear-gradient(#E9E2D8,#D5CBBD)', boxShadow: `inset 0 3px 0 ${H > 40 ? '#6E8F76' : '#B9AE9F'}, inset 0 -3px 0 rgba(0,0,0,.06)` });
      box.appendChild(face);
      w.appendChild(box);
    });
    FURNITURE.forEach(([x, y, wd, h], i) => {
      const c = FURN3D[i];
      const f = el('div', 'pf-furn');
      Object.assign(f.style, { left: `${x * S}px`, top: `${y * S}px`, width: `${wd * S}px`, height: `${h * S}px`, background: c, transitionDelay: `${i * 90}ms` });
      w.appendChild(f);
    });
    return w;
  }

  function build() {
    const root = el('div', 'pf');
    root.innerHTML = `
      <div class="pf-row">
        <article class="pf-card" data-step="0">
          <div class="pf-head"><b><span class="pf-dot"></span>PLANORA ASSISTANT</b><span>01 / 03</span></div>
          <div class="pf-body"><div class="pf-chat">
            <div class="pf-msg pf-user"><span class="pf-typed"></span><span class="pf-caret"></span></div>
            <div class="pf-msg pf-bot pf-think"><span class="pf-typing"><i></i><i></i><i></i></span></div>
            <div class="pf-msg pf-bot pf-reply">Laying out 6 rooms on your 12 × 9 m plot…<div class="pf-chips">${CHIPS.map(c => `<span class="pf-chip">${c}</span>`).join('')}</div></div>
            <div class="pf-composer">Describe your home…<i></i></div>
          </div></div>
        </article>
        <div class="pf-arrow" data-arrow="0">${arrow}</div>
        <article class="pf-card" data-step="1">
          <div class="pf-head"><b><span class="pf-dot"></span>2D PLAN</b><span>02 / 03</span></div>
          <div class="pf-body pf-plan">${WAIT}${planSvg()}</div>
        </article>
        <div class="pf-arrow" data-arrow="1">${arrow}</div>
        <article class="pf-card" data-step="2">
          <div class="pf-head"><b><span class="pf-dot"></span>3D VIEW</b><span>03 / 03</span></div>
          <div class="pf-body pf-3d">${WAIT}</div>
        </article>
      </div>
      <div class="pf-row pf-captions" style="margin-top:0">
        <div class="pf-caption"><span>01 / DESCRIBE</span><strong>Tell Planora what you need</strong></div><div></div>
        <div class="pf-caption"><span>02 / PLAN</span><strong>Watch the plan draw itself</strong></div><div></div>
        <div class="pf-caption"><span>03 / STEP INSIDE</span><strong>See it rise in 3D</strong></div>
      </div>
      <div class="pf-progress">${['Describe', 'Plan', '3D'].map(s => `<div class="pf-step"><i></i>${s}</div>`).join('')}</div>`;
    root.querySelector('.pf-3d').appendChild(world());
    return root;
  }

  function run(root) {
    const $ = s => root.querySelector(s), $$ = s => [...root.querySelectorAll(s)];
    const cards = $$('.pf-card'), arrows = $$('.pf-arrow'), steps = $$('.pf-step');
    const plan = $('.pf-plan'), d3 = $('.pf-3d'), typed = $('.pf-typed');
    let timers = [], running = false;
    const at = (ms, fn) => timers.push(setTimeout(fn, ms));
    const restartAnim = (node, cls) => { node.classList.remove(cls); void node.getBoundingClientRect(); node.classList.add(cls); };
    const stage = (i, dur) => {
      cards.forEach((c, k) => c.classList.toggle('is-active', k === i));
      arrows.forEach((a, k) => a.classList.toggle('is-on', k < i));
      steps.forEach((s, k) => { s.classList.toggle('is-active', k === i); s.classList.toggle('is-done', k < i); s.style.setProperty('--pf-dur', `${dur}ms`); });
      if (steps[i]) restartAnim(steps[i], 'is-active');
    };
    const reset = () => {
      timers.forEach(clearTimeout); timers = [];
      typed.textContent = '';
      $$('.pf-msg, .pf-chip').forEach(n => n.classList.remove('is-in'));
      plan.classList.remove('is-drawing', 'is-filled');
      d3.classList.remove('is-built', 'is-furnished', 'is-spinning');
      stage(-1, 0);
    };
    const finalFrame = () => {
      typed.textContent = PROMPT;
      $$('.pf-user, .pf-reply, .pf-chip').forEach(n => n.classList.add('is-in'));
      plan.classList.add('is-filled'); $$('.pf-wall').forEach(w => (w.style.strokeDashoffset = '0'));
      d3.classList.add('is-built', 'is-furnished');
    };
    const loop = () => {
      reset();
      stage(0, 3900);
      at(150, () => $('.pf-user').classList.add('is-in'));
      [...PROMPT].forEach((_, i) => at(300 + i * 32, () => { typed.textContent = PROMPT.slice(0, i + 1); }));
      const typedEnd = 300 + PROMPT.length * 32;
      at(typedEnd + 200, () => $('.pf-think').classList.add('is-in'));
      at(typedEnd + 1100, () => { $('.pf-think').classList.remove('is-in'); $('.pf-reply').classList.add('is-in'); });
      $$('.pf-chip').forEach((c, i) => at(typedEnd + 1300 + i * 140, () => c.classList.add('is-in')));
      const planAt = typedEnd + 2200;
      at(planAt, () => { stage(1, 3000); restartAnim(plan, 'is-drawing'); });
      at(planAt + 1700, () => plan.classList.add('is-filled'));
      const threeAt = planAt + 3200;
      at(threeAt, () => { stage(2, 4200); d3.classList.add('is-built', 'is-spinning'); });
      at(threeAt + 1300, () => d3.classList.add('is-furnished'));
      at(threeAt + 4400, () => { steps.forEach(s => s.classList.add('is-done')); });
      at(threeAt + 6200, () => { if (running) loop(); });
    };
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) { finalFrame(); return; }
    new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !running) { running = true; loop(); }
      else if (!entry.isIntersecting && running) { running = false; reset(); }
    }, { threshold: 0.35 }).observe(root);
  }

  function mount() {
    const track = document.querySelector('.lp-process .lp-process-track');
    if (!track || track.dataset.pfMounted) return false;
    const root = build();
    track.replaceWith(root);
    root.dataset.pfMounted = '1';
    const intro = document.querySelector('.lp-process .lp-section-heading > p:last-child');
    if (intro) intro.textContent = 'Type what you need. Planora lays out the plan in 2D, then raises it into a 3D home you can explore.';
    run(root);
    return true;
  }

  // The landing app renders after load; keep watching in case it re-renders the section.
  const observer = new MutationObserver(() => { if (!document.querySelector('.lp-process .pf')) mount(); });
  const start = () => { mount(); observer.observe(document.body, { childList: true, subtree: true }); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
