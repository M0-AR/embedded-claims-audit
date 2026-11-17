(function () {
  let active = false;
  let cleanup = [];
  let rootEl = null;
  let state = null;
  let sceneApi = null;
  let audioOn = true;

  const MISSIONS = [
    {
      id: 'align', title: 'Align the rotor', brief: 'Set the commutation error to 0° and command at least 2.3 N·m with ripple below 13.6%.',
      nodes: ['C01', 'C02', 'C03'], done: 'Aligned. The 13.4% is a property of the waveform, not the load.',
      check: (s) => Math.abs(s.angle) <= 1 && s.torque >= 2.3 && s.ripple <= 13.6,
      hint: (s) => Math.abs(s.angle) > 1 ? `Alignment error is ${s.angle.toFixed(1)}°; bring it within ±1°.` : s.torque < 2.3 ? 'Raise the current command a little.' : 'Increase current or reduce the remaining error.'
    },
    {
      id: 'headroom', title: 'Find the linear ceiling', brief: 'Raise modulation into the SVPWM window (0.55–0.577) without leaving the linear region.',
      nodes: ['C04', 'C05'], done: 'Headroom found. SVPWM reaches 1/√3, a 15.47% gain over SPWM.',
      check: (s) => s.angle <= 1 && s.m >= 0.55 && s.m <= 0.578 && s.torque >= 2.4,
      hint: (s) => s.m < 0.55 ? `Modulation is ${s.m.toFixed(3)}; the SVPWM window starts at 0.55.` : s.m > 0.578 ? 'You crossed the linear limit. Back off below 0.578.' : 'Hold alignment near zero and keep torque above 2.4 N·m.'
    },
    {
      id: 'deadtime', title: 'Tame dead time', brief: 'At m ≈ 0.40, cut dead time to 300 ns or less and push the fifth harmonic below 0.08%.',
      nodes: ['C06', 'C07'], done: 'Dead time controlled. The fifth harmonic is 2.079× the seventh, not the reverse.',
      check: (s) => s.td <= 300 && s.m >= 0.35 && s.m <= 0.45 && s.i5 <= 0.08,
      hint: (s) => s.td > 300 ? `Dead time is ${s.td} ns; target 300 ns or less.` : s.m < 0.35 || s.m > 0.45 ? 'Set modulation near 0.40.' : 'Reduce dead time further.'
    },
    {
      id: 'convention', title: 'Speak the right dialect', brief: 'Switch to the FOC peak convention and hold 2.3–2.6 N·m at about 80 A.',
      nodes: ['C08', 'C09', 'C10'], done: 'Convention fixed. The same motor is 0.03537 or 0.03063 N·m/A depending on the transform.',
      check: (s) => s.convention === 'foc' && s.iq >= 74 && s.iq <= 86 && s.torque >= 2.3 && s.torque <= 2.6,
      hint: (s) => s.convention !== 'foc' ? 'The drive is still using the DC/peak convention. Select FOC peak.' : s.torque > 2.6 ? 'Torque overshoots. Lower current or verify the convention.' : 'Raise current slightly while staying under 2.6 N·m.'
    },
    {
      id: 'thermal', title: 'Hold the thermal line', brief: 'Keep the winding below 85 °C while delivering at least 2.0 N·m. Dead time must stay ≤ 500 ns.',
      nodes: ['C11', 'C12', 'C13', 'C14', 'C15', 'C16', 'C17'], done: 'Thermal line held. Loss is not a single number; it is a function of current, dead time, and cooling.',
      check: (s) => s.temp <= 85 && s.torque >= 2.0 && s.td <= 500,
      hint: (s) => s.temp > 85 ? `Winding estimate is ${s.temp.toFixed(1)} °C; reduce current.` : s.torque < 2.0 ? 'Torque is below 2.0 N·m; raise current slightly.' : 'Reduce dead time below 500 ns.'
    },
    {
      id: 'provenance', title: 'Question the sensor', brief: 'Decide whether the torque channel is independent evidence. Lock the audit with the correct provenance.',
      nodes: ['C18', 'C19', 'C20', 'C21', 'C22'], done: 'Provenance locked. A derived torque channel cannot independently calibrate Kt; the voltage channel is the evidence.',
      check: (s) => s.decision === 'derived',
      hint: () => 'Choose the provenance that matches the dataset description: the torque channel is derived from commanded currents.'
    }
  ];

  const DEFAULTS = { mission: 0, score: 0, angle: 18, m: 0.42, td: 800, iq: 80, convention: 'dc', decision: null, unlocked: [], completed: [], started: false };

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  function fmt(value, digits = 1) {
    return Number(value).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }

  function storageKey() { return 'eca-game-v1'; }

  function loadState(ctx) {
    const saved = ctx.store?.get(storageKey(), null);
    const base = { ...DEFAULTS, unlocked: [], completed: [] };
    if (!saved || typeof saved !== 'object') return base;
    return {
      ...base, ...saved,
      unlocked: Array.isArray(saved.unlocked) ? saved.unlocked : [],
      completed: Array.isArray(saved.completed) ? saved.completed : []
    };
  }

  function saveState(ctx) {
    if (!state) return;
    ctx.store?.set(storageKey(), {
      mission: state.mission, score: state.score, angle: state.angle, m: state.m, td: state.td,
      iq: state.iq, convention: state.convention, decision: state.decision,
      unlocked: state.unlocked, completed: state.completed, started: state.started
    });
  }

  function interpolate(sweep, angle) {
    const abs = Math.min(30, Math.abs(Number(angle)));
    let best = sweep[0];
    sweep.forEach((point) => { if (Math.abs(point.delta_deg - abs) < Math.abs(best.delta_deg - abs)) best = point; });
    return best;
  }

  function metrics(state, results) {
    const sweep = results.e01_sixstep.misalignment.sweep;
    const point = interpolate(sweep, state.angle);
    const constants = results.e05_kt_ke.constants;
    const kt = { dc: constants.kt_dc_nm_per_a, foc: constants.kt_foc_peak_nm_per_a, rms: constants.kt_rms_nm_per_a }[state.convention] || constants.kt_foc_peak_nm_per_a;
    const torque = kt * state.iq;
    const i5 = 0.12405142161740208 * (state.td / 800) * (0.4 / Math.max(0.05, state.m));
    const i7 = i5 / 2.0786595168101845;
    const loss = state.iq * state.iq * 0.023 + (state.td / 800) * 2.5 + state.m * 6;
    const temp = 25 + loss * 0.42;
    return {
      angle: Number(state.angle), m: Number(state.m), td: Number(state.td), iq: Number(state.iq),
      convention: state.convention, decision: state.decision,
      ripple: point.pct_of_peak, rippleMean: point.pct_of_mean, torque, i5, i7,
      temp, loss, speed: 3000 * (state.m / 0.5773502691896258)
    };
  }

  function speak(text, force = false) {
    if (!audioOn && !force) return;
    if (!('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.volume = 1;
      utterance.rate = 0.96;
      utterance.pitch = 0.98;
      window.speechSynthesis.speak(utterance);
    } catch {}
  }

  function template() {
    return `<div class="game-shell">
      <div class="game-stage" id="gameStage">
        <canvas id="gameCanvas" aria-hidden="true"></canvas>
        <div class="game-loading" id="gameStart">
          <div class="start-card">
            <p class="eyebrow">Interactive mission · 6 stages</p>
            <h2>Enter the digital twin</h2>
            <p>Align the rotor, find the modulation ceiling, tame dead time, fix the convention, hold the thermal line, then question the sensor. The concept network lights up as you prove each idea.</p>
            <button class="btn primary" id="startGame">Start the audit</button>
            <p class="fine">Sound is on by default. Use the voice button to mute.</p>
          </div>
        </div>
        <div class="game-hud">
          <div class="hud-top">
            <div class="hud-mission"><p class="eyebrow" id="missionKicker">Mission 1 of 6</p><h3 id="missionTitle">Align the rotor</h3><p id="missionText"></p></div>
            <div class="hud-score"><strong id="scoreValue">0</strong><span>audit points</span></div>
          </div>
          <div class="hud-bottom">
            <div class="hud-chip" id="chipTorque">torque <strong>—</strong></div>
            <div class="hud-chip" id="chipRipple">ripple <strong>—</strong></div>
            <div class="hud-chip" id="chipTemp">winding <strong>—</strong></div>
            <div class="hud-chip" id="chipNodes">network <strong>0/22</strong></div>
          </div>
        </div>
        <div class="game-toast" id="gameToast"></div>
        <div class="node-tip" id="nodeTip" hidden></div>
      </div>
      <div class="game-panel">
        <div class="game-controls">
          <div class="control-top"><h3>Drive setup</h3><span id="setupLabel">m 0.420 · 800 ns</span></div>
          <div class="control"><label for="gAngle">Commutation error</label><div class="control-row"><input type="number" id="gAngleNum" min="0" max="30" step="0.5" value="18"><span class="fine">deg</span></div><input type="range" id="gAngle" min="0" max="30" step="0.5" value="18" aria-label="Commutation error"></div>
          <div class="control"><label for="gM">Modulation index</label><div class="control-row"><input type="number" id="gMNum" min="0.1" max="0.6" step="0.005" value="0.42"><span class="fine">m</span></div><input type="range" id="gM" min="0.1" max="0.6" step="0.005" value="0.42" aria-label="Modulation index"></div>
          <div class="control"><label for="gTd">Dead time</label><div class="control-row"><input type="number" id="gTdNum" min="0" max="1500" step="25" value="800"><span class="fine">ns</span></div><input type="range" id="gTd" min="0" max="1500" step="25" value="800" aria-label="Dead time"></div>
          <div class="control"><label for="gIq">Current command</label><div class="control-row"><input type="number" id="gIqNum" min="20" max="110" step="1" value="80"><span class="fine">A</span></div><input type="range" id="gIq" min="20" max="110" step="1" value="80" aria-label="Current command"></div>
          <div class="control"><label for="gConv">Kt convention</label><select id="gConv"><option value="foc">FOC peak</option><option value="dc" selected>DC / peak</option><option value="rms">RMS</option></select></div>
          <div class="game-actions"><button class="btn primary" id="applySetup">Apply setup</button><button class="btn" id="resetGame">Reset run</button><button class="btn" id="voiceToggle" aria-pressed="true">Voice on</button></div>
          <div class="game-mission-list" id="missionPips"></div>
        </div>
        <div class="game-side">
          <div class="control-top"><h3>Concept network</h3><span id="nodeCount">0 / 22</span></div>
          <div class="game-feed" id="gameFeed"><div class="feed-line"><span class="dot"></span><span>Mission 1 is live. The network is dark until you produce evidence.</span></div></div>
          <p class="fine" id="conceptNote">Each mission unlocks the claims that depend on it. Hover a node to inspect the claim.</p>
          <div id="decisionBox"></div>
          <button class="text-btn" id="inlineHelp">How to play</button>
        </div>
      </div>
    </div>`;
  }

  function mount(root, ctx) {
    if (active) unmount();
    active = true;
    rootEl = root;
    state = loadState(ctx);
    if (!Number.isFinite(state.mission) || state.mission < 0) state.mission = 0;
    if (state.mission > MISSIONS.length) state.mission = MISSIONS.length;
    if (state.completed.length >= MISSIONS.length) state.mission = MISSIONS.length;
    audioOn = ctx.store?.get('eca-game-voice', true) !== false;
    root.innerHTML = template();
    const stage = root.querySelector('#gameStage');
    const canvas = root.querySelector('#gameCanvas');
    const feed = root.querySelector('#gameFeed');
    const tip = root.querySelector('#nodeTip');
    if (state.mission >= MISSIONS.length) {
      feed.innerHTML = '<div class="feed-line"><span class="dot" style="background:var(--green)"></span><span><strong>Audit complete</strong> All 22 concept nodes are online. Explore the claim registry or reset the run.</span></div>';
    } else if (state.mission > 0) {
      feed.innerHTML = `<div class="feed-line"><span class="dot"></span><span>Mission ${state.mission + 1} is live. Continue where you left off.</span></div>`;
    }

    const sync = (id, key) => {
      const range = root.querySelector(`#${id}`);
      const number = root.querySelector(`#${id}Num`);
      const apply = (value) => {
        const clamped = Math.min(Number(range.max), Math.max(Number(range.min), Number(value)));
        range.value = clamped;
        if (number) number.value = clamped;
        state[key] = clamped;
        onControl();
      };
      range.addEventListener('input', () => apply(range.value));
      if (number) number.addEventListener('input', () => apply(number.value));
      range.value = state[key];
      if (number) number.value = state[key];
    };

    sync('gAngle', 'angle');
    sync('gM', 'm');
    sync('gTd', 'td');
    sync('gIq', 'iq');
    const conv = root.querySelector('#gConv');
    conv.value = state.convention;
    conv.addEventListener('change', () => { state.convention = conv.value; onControl(); });

    const voiceButton = root.querySelector('#voiceToggle');
    const setVoiceLabel = () => {
      voiceButton.textContent = audioOn ? 'Voice on' : 'Voice off';
      voiceButton.setAttribute('aria-pressed', String(audioOn));
    };
    setVoiceLabel();
    voiceButton.addEventListener('click', () => {
      audioOn = !audioOn;
      ctx.store?.set('eca-game-voice', audioOn);
      setVoiceLabel();
      if (audioOn) speak('Voice on. The audit continues.');
      else window.speechSynthesis?.cancel();
    });

    const start = root.querySelector('#startGame');
    start.addEventListener('click', () => {
      root.querySelector('#gameStart').hidden = true;
      state.started = true;
      saveState(ctx);
      speak(MISSIONS[state.mission].brief);
      toast('Use the sliders, then press Apply setup.');
      render();
    });
    if (state.started) root.querySelector('#gameStart').hidden = true;

    function toast(message) {
      const element = root.querySelector('#gameToast');
      element.textContent = message;
      element.classList.add('show');
      clearTimeout(toast.timer);
      toast.timer = setTimeout(() => element.classList.remove('show'), 3400);
    }

    function onControl() {
      render();
      saveState(ctx);
    }

    function addFeed(title, body, tone = '') {
      const line = document.createElement('div');
      line.className = 'feed-line';
      line.innerHTML = `<span class="dot" style="background:var(${tone || '--teal'})"></span><span><strong>${esc(title)}</strong> ${esc(body)}</span>`;
      feed.prepend(line);
      while (feed.children.length > 7) feed.lastElementChild.remove();
    }

    function setDecisionBox() {
      const box = root.querySelector('#decisionBox');
      if (state.mission !== 5) { box.innerHTML = ''; return; }
      box.innerHTML = `<p class="eyebrow" style="margin-top:14px">Final provenance decision</p><div class="game-actions" style="margin-top:8px"><button class="btn" data-decision="derived">Derived from commanded currents</button><button class="btn" data-decision="sensor">Independent torque sensor</button></div>`;
      box.querySelectorAll('[data-decision]').forEach((button) => button.addEventListener('click', () => {
        state.decision = button.dataset.decision;
        onControl();
        toast(state.decision === 'derived' ? 'Provenance selected. Press Apply to lock the audit.' : 'That choice contradicts the dataset description. Try the other one.');
      }));
    }

    function render() {
      const s = metrics(state, ctx.results);
      const mission = MISSIONS[state.mission];
      const unlocked = new Set(state.unlocked);
      root.querySelector('#scoreValue').textContent = state.score;
      root.querySelector('#missionKicker').textContent = state.mission >= MISSIONS.length ? 'Audit complete' : `Mission ${state.mission + 1} of ${MISSIONS.length}`;
      root.querySelector('#missionTitle').textContent = state.mission >= MISSIONS.length ? 'Audit complete' : mission.title;
      root.querySelector('#missionText').textContent = state.mission >= MISSIONS.length ? 'All six missions are complete. The concept network is online. Replay a mission or explore the claim registry.' : mission.brief;
      root.querySelector('#chipTorque').innerHTML = `torque <strong>${fmt(s.torque, 2)} N·m</strong>`;
      root.querySelector('#chipRipple').innerHTML = `ripple <strong>${fmt(s.ripple, 1)}%</strong>`;
      root.querySelector('#chipTemp').innerHTML = `winding <strong>${fmt(s.temp, 1)} °C</strong>`;
      root.querySelector('#chipNodes').innerHTML = `network <strong>${unlocked.size}/22</strong>`;
      root.querySelector('#chipTemp').className = `hud-chip ${s.temp > 85 ? 'bad' : 'good'}`;
      root.querySelector('#chipRipple').className = `hud-chip ${s.ripple > 20 ? 'bad' : ''}`;
      root.querySelector('#setupLabel').textContent = `m ${fmt(state.m, 3)} · ${state.td} ns`;
      root.querySelector('#nodeCount').textContent = `${unlocked.size} / 22`;
      root.querySelector('#missionPips').innerHTML = MISSIONS.map((entry, index) => `<span class="mission-pip ${state.completed.includes(entry.id) ? 'done' : index === state.mission ? 'active' : ''}" title="${esc(entry.title)}"></span>`).join('');
      setDecisionBox();
      sceneApi?.update({ metrics: s, state, unlocked });
      saveState(ctx);
    }

    function checkMessage(s, mission) {
      if (state.mission >= MISSIONS.length) return 'The audit is complete.';
      if (mission.id === 'provenance') return mission.hint(s);
      return mission.hint(s);
    }

    root.querySelector('#applySetup').addEventListener('click', () => {
      if (!state.started) {
        root.querySelector('#gameStart').hidden = true;
        state.started = true;
      }
      if (state.mission >= MISSIONS.length) {
        toast('Audit already complete. Reset the run to replay.');
        return;
      }
      const mission = MISSIONS[state.mission];
      const s = metrics(state, ctx.results);
      if (!mission.check(s)) {
        state.score = Math.max(0, state.score - 5);
        const message = checkMessage(s, mission);
        toast(message);
        addFeed('Not yet', message, '--amber');
        speak(message);
        render();
        return;
      }
      state.score += 120;
      state.completed.push(mission.id);
      mission.nodes.forEach((id) => { if (!state.unlocked.includes(id)) state.unlocked.push(id); });
      state.mission += 1;
      if (state.mission >= MISSIONS.length) {
        state.score += 250;
        state.unlocked = ctx.claims.map((claim) => claim.id);
        addFeed('Audit complete', 'All 22 concept nodes are online. The network shows every verdict.', '--green');
        toast('Audit complete. All 22 nodes online.');
        speak('Audit complete. All twenty two concept nodes are online. You have rebuilt the argument from evidence.');
      } else {
        addFeed('Unlocked', `${mission.nodes.length} concept node${mission.nodes.length === 1 ? '' : 's'} · ${mission.done}`, '--green');
        toast(`${mission.title} complete. +120 points.`);
        speak(`${mission.title} complete. ${mission.done} ${MISSIONS[state.mission].brief}`);
      }
      render();
      if (state.mission < MISSIONS.length) root.querySelector('#missionTitle').focus?.();
    });

    root.querySelector('#resetGame').addEventListener('click', () => {
      state = { ...DEFAULTS, unlocked: [], completed: [], started: true };
      root.querySelector('#gameStart').hidden = true;
      syncControls();
      feed.innerHTML = '<div class="feed-line"><span class="dot"></span><span>Run reset. Mission 1 is live.</span></div>';
      toast('Run reset. The concept network is dark again.');
      render();
      speak('Run reset. Mission one. Align the rotor.');
    });

    function syncControls() {
      [['gAngle', 'angle'], ['gM', 'm'], ['gTd', 'td'], ['gIq', 'iq']].forEach(([id, key]) => {
        const range = root.querySelector(`#${id}`);
        const number = root.querySelector(`#${id}Num`);
        range.value = state[key];
        if (number) number.value = state[key];
      });
      conv.value = state.convention;
    }

    root.querySelector('#inlineHelp').addEventListener('click', () => {
      toast('Pick a mission, move the controls, press Apply setup. Green feedback means the target is met. Voice can be muted.');
    });

    if (state.started) root.querySelector('#gameStart').hidden = true;
    render();

    const resizeObserver = new ResizeObserver(() => sceneApi?.resize());
    resizeObserver.observe(stage);
    cleanup.push(() => resizeObserver.disconnect());

    import('./vendor/three.module.js').then((THREE) => {
      sceneApi = buildScene(THREE, canvas, stage, tip);
      sceneApi.update({ metrics: metrics(state, ctx.results), state, unlocked: new Set(state.unlocked) });
      cleanup.push(() => sceneApi?.dispose());
    }).catch(() => {
      sceneApi = buildFallback(canvas, stage);
      sceneApi.update({ metrics: metrics(state, ctx.results), state, unlocked: new Set(state.unlocked) });
      cleanup.push(() => sceneApi?.dispose());
    });

    cleanup.push(() => {
      window.speechSynthesis?.cancel();
      root.innerHTML = '';
    });
  }

  function buildScene(THREE, canvas, stage, tip) {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x071013, 0.045);
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 120);
    camera.position.set(4.7, 3.1, 8.3);
    camera.lookAt(0, 2.1, 0);

    const hemi = new THREE.HemisphereLight(0xbfe9e2, 0x071013, 0.9);
    scene.add(hemi);
    const amber = new THREE.PointLight(0xf2b544, 90, 24);
    amber.position.set(-4, 3, 5);
    scene.add(amber);
    const teal = new THREE.PointLight(0x57d6c7, 70, 24);
    teal.position.set(4, 5, 3);
    scene.add(teal);

    const grid = new THREE.GridHelper(24, 24, 0x1d3b3b, 0x102323);
    grid.position.y = -1.7;
    scene.add(grid);

    const motor = new THREE.Group();
    motor.position.y = 0;
    scene.add(motor);
    const steel = new THREE.MeshStandardMaterial({ color: 0x234246, metalness: 0.75, roughness: 0.32 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x111c1e, metalness: 0.45, roughness: 0.6 });
    const copper = new THREE.MeshStandardMaterial({ color: 0xb46b2a, metalness: 0.85, roughness: 0.25, emissive: 0x3a1600, emissiveIntensity: 0.3 });
    const stator = new THREE.Mesh(new THREE.TorusGeometry(1.55, 0.3, 14, 80), steel);
    motor.add(stator);
    const inner = new THREE.Mesh(new THREE.TorusGeometry(1.17, 0.08, 10, 70), dark);
    motor.add(inner);
    for (let i = 0; i < 12; i += 1) {
      const coil = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.28, 0.58), copper);
      const angle = (i / 12) * Math.PI * 2;
      coil.position.set(Math.cos(angle) * 1.57, Math.sin(angle) * 1.57, 0);
      coil.rotation.z = angle;
      motor.add(coil);
    }
    const rotor = new THREE.Group();
    motor.add(rotor);
    const rotorCore = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.72, 40), dark);
    rotorCore.rotation.x = Math.PI / 2;
    rotor.add(rotorCore);
    for (let i = 0; i < 8; i += 1) {
      const magnet = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.58, 0.75), new THREE.MeshStandardMaterial({
        color: i % 2 ? 0xff8080 : 0x73d8ff, metalness: 0.6, roughness: 0.3, emissive: i % 2 ? 0x551111 : 0x0a3344, emissiveIntensity: 0.5
      }));
      const angle = (i / 8) * Math.PI * 2;
      magnet.position.set(Math.cos(angle) * 0.62, Math.sin(angle) * 0.62, 0);
      magnet.rotation.z = angle;
      rotor.add(magnet);
    }
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 1.75, 20), steel);
    shaft.rotation.x = Math.PI / 2;
    motor.add(shaft);

    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.16, 2.1, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0x57d6c7, transparent: true, opacity: 0.22 }));
    beam.position.y = 2.28;
    scene.add(beam);

    const brain = new THREE.Group();
    brain.position.y = 3.95;
    scene.add(brain);
    const lobeMat = new THREE.MeshBasicMaterial({ color: 0x4d9d92, wireframe: true, transparent: true, opacity: 0.12 });
    [-1.15, 1.15].forEach((x, index) => {
      const lobe = new THREE.Mesh(new THREE.SphereGeometry(1.22, 18, 12), lobeMat);
      lobe.position.x = x;
      lobe.scale.set(1.3, 0.9, 1.0);
      lobe.rotation.z = index ? -0.22 : 0.22;
      brain.add(lobe);
    });

    const nodeGeometry = new THREE.IcosahedronGeometry(0.095, 1);
    const nodes = new Map();
    const nodeGroup = new THREE.Group();
    brain.add(nodeGroup);
    const claimIds = ['C01', 'C02', 'C03', 'C04', 'C05', 'C06', 'C07', 'C08', 'C09', 'C10', 'C11', 'C12', 'C13', 'C14', 'C15', 'C16', 'C17', 'C18', 'C19', 'C20', 'C21', 'C22'];
    const verdictById = new Map((window.ECA?.claims || []).map((claim) => [claim.id, claim.verdict]));
    claimIds.forEach((id, index) => {
      const lobe = index < 11 ? 0 : 1;
      const local = lobe === 0 ? index : index - 11;
      const count = 11;
      const y = 1 - (local / (count - 1)) * 1.65;
      const radius = Math.sqrt(Math.max(0, 1 - y * y));
      const phi = local * 2.399963229728653;
      const position = new THREE.Vector3(
        (lobe ? 1.15 : -1.15) + Math.cos(phi) * radius * 1.35,
        y * 1.05,
        Math.sin(phi) * radius * 0.92
      );
      const material = new THREE.MeshStandardMaterial({ color: 0x48615f, emissive: 0x0b1b1b, emissiveIntensity: 0.4, roughness: 0.4, metalness: 0.2 });
      const mesh = new THREE.Mesh(nodeGeometry, material);
      mesh.position.copy(position);
      mesh.userData = { claimId: id, verdict: verdictById.get(id) || 'qualified', unlocked: false, base: position.clone() };
      nodeGroup.add(mesh);
      nodes.set(id, mesh);
    });

    const edgeMaterial = new THREE.LineBasicMaterial({ color: 0x2b6a63, transparent: true, opacity: 0.24 });
    function addEdge(a, b) {
      const geometry = new THREE.BufferGeometry().setFromPoints([nodes.get(a).position, nodes.get(b).position]);
      brain.add(new THREE.Line(geometry, edgeMaterial));
    }
    ['C01', 'C02', 'C03', 'C04', 'C05', 'C06', 'C07', 'C08', 'C09', 'C10', 'C11'].reduce((previous, id) => { if (previous) addEdge(previous, id); return id; }, null);
    ['C12', 'C13', 'C14', 'C15', 'C16', 'C17', 'C18', 'C19', 'C20', 'C21', 'C22'].reduce((previous, id) => { if (previous) addEdge(previous, id); return id; }, null);
    [['C03', 'C12'], ['C07', 'C18'], ['C10', 'C20'], ['C05', 'C16']].forEach(([a, b]) => addEdge(a, b));

    const particleGeometry = new THREE.BufferGeometry();
    const particles = new Float32Array(220 * 3);
    for (let i = 0; i < particles.length; i += 3) {
      particles[i] = (Math.random() - 0.5) * 14;
      particles[i + 1] = Math.random() * 8 - 1.4;
      particles[i + 2] = (Math.random() - 0.5) * 10;
    }
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(particles, 3));
    const dust = new THREE.Points(particleGeometry, new THREE.PointsMaterial({ color: 0x57d6c7, size: 0.018, transparent: true, opacity: 0.35, depthWrite: false }));
    scene.add(dust);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2(10, 10);
    let hovered = null;
    function movePointer(event) {
      const rect = canvas.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(Array.from(nodes.values()), false);
      const hit = hits[0]?.object || null;
      if (hovered !== hit) {
        hovered = hit;
        canvas.style.cursor = hit ? 'pointer' : 'default';
      }
      if (hit) {
        const claim = window.ECA?.claims?.find((entry) => entry.id === hit.userData.claimId);
        tip.hidden = false;
        tip.innerHTML = `<strong>${esc(hit.userData.claimId)}</strong>${esc(claim?.claim || '')}<span>${esc(hit.userData.unlocked ? hit.userData.verdict : 'locked · complete a mission')}</span>`;
        tip.style.left = `${Math.min(stage.clientWidth - 220, event.clientX - stage.getBoundingClientRect().left + 12)}px`;
        tip.style.top = `${event.clientY - stage.getBoundingClientRect().top + 12}px`;
      } else {
        tip.hidden = true;
      }
    }
    canvas.addEventListener('pointermove', movePointer);
    canvas.addEventListener('pointerleave', () => { tip.hidden = true; hovered = null; });

    let width = 1;
    let height = 1;
    function resize() {
      const rect = stage.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }
    resize();

    let frame = 0;
    let last = performance.now();
    let metricsState = null;
    let unlockedState = new Set();
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function update({ metrics, state: gameState, unlocked }) {
      metricsState = metrics;
      unlockedState = unlocked;
      nodes.forEach((mesh, id) => {
        const isUnlocked = unlocked.has(id);
        mesh.userData.unlocked = isUnlocked;
        const verdictColor = { supported: 0x71e6a8, qualified: 0xf2b544, refuted: 0xff8585 }[mesh.userData.verdict] || 0x57d6c7;
        mesh.material.color.setHex(isUnlocked ? verdictColor : 0x425856);
        mesh.material.emissive.setHex(isUnlocked ? verdictColor : 0x0a1515);
        mesh.material.emissiveIntensity = isUnlocked ? 0.85 : 0.25;
        mesh.scale.setScalar(isUnlocked ? 1.25 : 0.72);
      });
      const rotorSpeed = (gameState?.m || 0.42) * 2.4;
      scene.userData.rotorSpeed = rotorSpeed;
    }

    function animate(now) {
      if (!active) return;
      const delta = Math.min(0.05, (now - last) / 1000);
      last = now;
      frame = requestAnimationFrame(animate);
      const speed = scene.userData.rotorSpeed || 1.0;
      if (!reduceMotion) {
        rotor.rotation.z += delta * speed;
        brain.rotation.y = Math.sin(now * 0.00018) * 0.12;
        dust.rotation.y += delta * 0.02;
        const t = now * 0.001;
        nodes.forEach((mesh, id) => {
          if (!mesh.userData.unlocked) return;
          const pulse = 1 + Math.sin(t * 2 + mesh.position.x * 4) * 0.08;
          mesh.scale.setScalar(1.25 * pulse);
        });
        const vibration = (metricsState?.ripple || 0) / 100;
        motor.position.x = Math.sin(now * 0.04) * vibration * 0.07;
        motor.position.y = Math.cos(now * 0.05) * vibration * 0.045;
      }
      renderer.render(scene, camera);
    }
    frame = requestAnimationFrame(animate);

    return {
      update,
      resize,
      dispose() {
        cancelAnimationFrame(frame);
        canvas.removeEventListener('pointermove', movePointer);
        renderer.dispose();
        scene.traverse((object) => {
          if (object.geometry) object.geometry.dispose();
          if (object.material) {
            if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose());
            else object.material.dispose();
          }
        });
      }
    };
  }

  function buildFallback(canvas, stage) {
    const ctx = canvas.getContext('2d');
    let width = 1;
    let height = 1;
    let frame = 0;
    let metricsState = null;
    let unlockedState = new Set();
    const nodes = Array.from({ length: 22 }, (_, index) => ({ angle: (index / 22) * Math.PI * 2, id: `C${String(index + 1).padStart(2, '0')}` }));
    function resize() {
      const rect = stage.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    function update({ metrics, unlocked }) {
      metricsState = metrics;
      unlockedState = unlocked;
    }
    function animate(now) {
      if (!active) return;
      frame = requestAnimationFrame(animate);
      ctx.clearRect(0, 0, width, height);
      const cx = width / 2;
      const cy = height * 0.62;
      const radius = Math.min(width, height) * 0.2;
      ctx.strokeStyle = '#f2b544';
      ctx.lineWidth = 14;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = '#234246';
      ctx.lineWidth = 4;
      for (let i = 0; i < 12; i += 1) {
        const angle = (i / 12) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(angle) * radius * 0.75, cy + Math.sin(angle) * radius * 0.75);
        ctx.lineTo(cx + Math.cos(angle) * radius * 1.05, cy + Math.sin(angle) * radius * 1.05);
        ctx.stroke();
      }
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate((now * 0.001) * (metricsState?.speed || 100) / 900);
      ctx.fillStyle = '#57d6c7';
      ctx.beginPath();
      ctx.arc(0, 0, radius * 0.38, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#071013';
      for (let i = 0; i < 8; i += 1) {
        const angle = (i / 8) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(Math.cos(angle) * radius * 0.24, Math.sin(angle) * radius * 0.24, 5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      const bx = cx;
      const by = height * 0.24;
      nodes.forEach((node) => {
        const x = bx + Math.cos(node.angle) * Math.min(110, width * 0.14);
        const y = by + Math.sin(node.angle) * Math.min(60, height * 0.08);
        ctx.beginPath();
        ctx.arc(x, y, unlockedState.has(node.id) ? 4 : 2, 0, Math.PI * 2);
        ctx.fillStyle = unlockedState.has(node.id) ? '#71e6a8' : '#425856';
        ctx.fill();
      });
      ctx.fillStyle = '#a1b6b1';
      ctx.font = '12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('2D schematic · WebGL unavailable', cx, height - 18);
    }
    resize();
    frame = requestAnimationFrame(animate);
    return { update, resize, dispose() { cancelAnimationFrame(frame); } };
  }

  function unmount() {
    active = false;
    cleanup.forEach((fn) => { try { fn(); } catch {} });
    cleanup = [];
    sceneApi = null;
    rootEl = null;
    state = null;
  }

  window.ECAGame = { mount, unmount };
})();
