(function() {
  "use strict";

  // -----------------------------------------------------------------------
  // COLOR PALETTES
  // -----------------------------------------------------------------------
  var DARK = {
    bg: '#0d1117', traceBg: '#141924',
    text: '#c8d8e8', textDim: '#556677',
    grid: 'rgba(60,75,95,0.3)', axes: '#3a4a5a',
    lane: ['#2a3444', '#252f3e', '#2a3444'],
    p300: '#f5a623', n400: '#5b8fd9', n170: '#00d68f',
    blink: '#ff6b6b', muscle: '#e74c3c',
    noise: '#445566', hit: '#4CAF50', miss: '#ff6b6b'
  };
  var LIGHT = {
    bg: '#e8ecf3', traceBg: '#f0f3f7',
    text: '#2c3e50', textDim: '#8899aa',
    grid: 'rgba(100,120,140,0.15)', axes: '#b0bec5',
    lane: ['#e0e5ed', '#dbe1ea', '#e0e5ed'],
    p300: '#e09400', n400: '#3a70c0', n170: '#00a06a',
    blink: '#e04040', muscle: '#c0302a',
    noise: '#9aa8b8', hit: '#2e8b40', miss: '#d04040'
  };

  function C() {
    return document.documentElement.getAttribute('data-theme') === 'light' ? LIGHT : DARK;
  }

  // -----------------------------------------------------------------------
  // CANVAS SETUP
  // -----------------------------------------------------------------------
  var canvas = document.getElementById('game-canvas');
  var ctx = canvas.getContext('2d');
  var W = 800, H = 400;
  var dpr = window.devicePixelRatio || 1;

  function setupCanvas() {
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + 'px';
    canvas.style.maxWidth = '100%';
    canvas.style.height = 'auto';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  setupCanvas();

  // -----------------------------------------------------------------------
  // NOISE GENERATION (pink noise via spectral method)
  // -----------------------------------------------------------------------
  var NOISE_LEN = 4000;

  function mulberry32(a) {
    return function() {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function generatePinkNoise(len, seed) {
    var rng = mulberry32(seed);
    var buf = new Float32Array(len);
    // Voss-McCartney algorithm (simplified)
    var b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (var i = 0; i < len; i++) {
      var white = rng() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      buf[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
    }
    return buf;
  }

  // -----------------------------------------------------------------------
  // ERP COMPONENT TYPES
  // -----------------------------------------------------------------------
  var ERP_TYPES = {
    P300:   { label: 'P300',  colorKey: 'p300',   amp: 1.0,  width: 40, points: 100, isArtifact: false, desc: 'Memory update signal' },
    N400:   { label: 'N400',  colorKey: 'n400',   amp: -0.9, width: 45, points: 100, isArtifact: false, desc: 'Semantic processing' },
    N170:   { label: 'N170',  colorKey: 'n170',   amp: -0.7, width: 30, points: 80,  isArtifact: false, desc: 'Visual recognition' },
    BLINK:  { label: 'BLINK', colorKey: 'blink',  amp: 1.8,  width: 60, points: -80, isArtifact: true,  desc: 'Eye blink artifact' },
    MUSCLE: { label: 'EMG',   colorKey: 'muscle', amp: 0.5,  width: 35, points: -60, isArtifact: true,  desc: 'Muscle artifact' }
  };

  // -----------------------------------------------------------------------
  // GAME STATE
  // -----------------------------------------------------------------------
  var LANES = 3;
  var LANE_LABELS = ['Fz', 'Cz', 'Pz'];
  var LANE_H = Math.floor((H - 60) / LANES);
  var LANE_TOP = 50;

  var state = {
    phase: 'start', // start, playing, roundEnd, gameover
    score: 0,
    round: 1,
    combo: 0,
    maxCombo: 0,
    timeLeft: 60,
    roundDuration: 60,

    // Scrolling
    scrollX: 0,
    scrollSpeed: 80, // px/s

    // Noise buffers (one per lane)
    noise: [],
    noiseSeed: 42,

    // Components on screen
    components: [],
    nextSpawnX: 400,
    spawnInterval: 180,

    // Particles & floating text
    particles: [],
    floatingTexts: [],

    // Round config
    snr: 3.0,
    availableTypes: ['P300', 'N400'],

    // Stats
    hits: 0,
    misses: 0,
    artifactClicks: 0
  };

  // -----------------------------------------------------------------------
  // GAME INITIALIZATION
  // -----------------------------------------------------------------------
  function initRound() {
    state.timeLeft = state.roundDuration;
    state.scrollX = 0;
    state.nextSpawnX = W + 100;
    state.components = [];
    state.particles = [];
    state.floatingTexts = [];
    state.combo = 0;
    state.hits = 0;
    state.misses = 0;
    state.artifactClicks = 0;

    // Regenerate noise
    state.noise = [];
    for (var i = 0; i < LANES; i++) {
      state.noise.push(generatePinkNoise(NOISE_LEN, state.noiseSeed + i + state.round * 7));
    }

    // Round difficulty
    if (state.round <= 3) {
      state.snr = 3.0;
      state.availableTypes = ['P300', 'N400'];
      state.scrollSpeed = 80;
      state.spawnInterval = 200;
    } else if (state.round <= 6) {
      state.snr = 1.5;
      state.availableTypes = ['P300', 'N400', 'N170'];
      state.scrollSpeed = 100;
      state.spawnInterval = 170;
    } else {
      state.snr = Math.max(0.6, 1.0 - (state.round - 7) * 0.1);
      state.availableTypes = ['P300', 'N400', 'N170', 'BLINK', 'MUSCLE'];
      state.scrollSpeed = Math.min(140, 100 + (state.round - 7) * 8);
      state.spawnInterval = Math.max(120, 170 - (state.round - 7) * 10);
    }
  }

  function startGame() {
    state.phase = 'playing';
    state.score = 0;
    state.round = 1;
    state.combo = 0;
    state.maxCombo = 0;
    initRound();
    document.getElementById('game-overlay').style.display = 'none';
    document.getElementById('game-hud').style.display = 'flex';
    document.getElementById('erp-legend').style.display = 'flex';
    lastTime = performance.now();
    requestAnimationFrame(gameLoop);
  }

  // -----------------------------------------------------------------------
  // COMPONENT SPAWNING
  // -----------------------------------------------------------------------
  function spawnComponent() {
    var types = state.availableTypes;
    var typeKey = types[Math.floor(Math.random() * types.length)];
    var erpType = ERP_TYPES[typeKey];
    var lane = Math.floor(Math.random() * LANES);

    // Artifacts prefer lane 0 (Fz for blinks)
    if (typeKey === 'BLINK') lane = 0;

    state.components.push({
      type: typeKey,
      erp: erpType,
      worldX: state.scrollX + W + 50 + Math.random() * 100,
      lane: lane,
      hit: false,
      missed: false,
      radius: erpType.width / 2 + 10
    });
  }

  // -----------------------------------------------------------------------
  // GAUSSIAN SHAPE FOR ERP COMPONENTS
  // -----------------------------------------------------------------------
  function gauss(x, mu, sigma) {
    var d = (x - mu) / sigma;
    return Math.exp(-0.5 * d * d);
  }

  // -----------------------------------------------------------------------
  // GET NOISE VALUE AT POSITION
  // -----------------------------------------------------------------------
  function getNoiseAt(lane, worldX) {
    var idx = Math.floor(worldX * 0.5) % NOISE_LEN;
    if (idx < 0) idx += NOISE_LEN;
    return state.noise[lane][idx];
  }

  // -----------------------------------------------------------------------
  // GET SIGNAL VALUE (noise + any components)
  // -----------------------------------------------------------------------
  function getSignalAt(lane, worldX) {
    var noiseAmp = 30 / state.snr;
    var val = getNoiseAt(lane, worldX) * noiseAmp;

    // Add component waveforms
    for (var i = 0; i < state.components.length; i++) {
      var comp = state.components[i];
      if (comp.lane !== lane) continue;
      var dx = worldX - comp.worldX;
      if (Math.abs(dx) > comp.erp.width * 2) continue;

      if (comp.type === 'MUSCLE') {
        // High frequency burst
        var env = gauss(dx, 0, comp.erp.width / 2);
        val += env * Math.sin(dx * 0.8) * 25 * comp.erp.amp;
      } else {
        // Gaussian peak
        var g = gauss(dx, 0, comp.erp.width / 3);
        val += g * 30 * comp.erp.amp;
      }
    }

    return val;
  }

  // -----------------------------------------------------------------------
  // HIT DETECTION
  // -----------------------------------------------------------------------
  function handleClick(e) {
    if (state.phase !== 'playing') return;

    var rect = canvas.getBoundingClientRect();
    var scaleX = W / rect.width;
    var scaleY = H / rect.height;
    var mx = (e.clientX - rect.left) * scaleX;
    var my = (e.clientY - rect.top) * scaleY;

    var bestComp = null;
    var bestDist = Infinity;

    for (var i = 0; i < state.components.length; i++) {
      var comp = state.components[i];
      if (comp.hit || comp.missed) continue;

      var screenX = comp.worldX - state.scrollX;
      var laneY = LANE_TOP + comp.lane * LANE_H + LANE_H / 2;
      var dy = my - laneY;
      var dx = mx - screenX;
      var dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < comp.radius + 15 && dist < bestDist) {
        bestDist = dist;
        bestComp = comp;
      }
    }

    if (bestComp) {
      bestComp.hit = true;
      var screenX = bestComp.worldX - state.scrollX;
      var laneY = LANE_TOP + bestComp.lane * LANE_H + LANE_H / 2;
      var pts = bestComp.erp.points;

      if (bestComp.erp.isArtifact) {
        // Penalty for clicking artifact
        state.combo = 0;
        state.artifactClicks++;
        state.score = Math.max(0, state.score + pts);
        spawnParticles(screenX, laneY, C()[bestComp.erp.colorKey], 6);
        addFloatingText(screenX, laneY, pts, C().miss);
      } else {
        // Reward for catching ERP
        state.combo++;
        if (state.combo > state.maxCombo) state.maxCombo = state.combo;
        state.hits++;
        var comboMult = Math.min(state.combo, 5);
        var earned = pts * comboMult;
        state.score += earned;
        spawnParticles(screenX, laneY, C()[bestComp.erp.colorKey], 12);
        addFloatingText(screenX, laneY, earned, C().hit);
      }
      updateHUD();
    }
  }

  canvas.addEventListener('click', handleClick);

  // -----------------------------------------------------------------------
  // PARTICLES & FLOATING TEXT
  // -----------------------------------------------------------------------
  function spawnParticles(x, y, color, count) {
    for (var i = 0; i < count; i++) {
      state.particles.push({
        x: x, y: y,
        vx: (Math.random() - 0.5) * 150,
        vy: -(Math.random() * 100 + 30),
        alpha: 1,
        color: color,
        life: 0.6 + Math.random() * 0.3,
        size: 2 + Math.random() * 3
      });
    }
  }

  function addFloatingText(x, y, score, color) {
    state.floatingTexts.push({
      x: x, y: y,
      text: (score > 0 ? '+' : '') + score,
      color: color,
      life: 1.2,
      maxLife: 1.2
    });
  }

  // -----------------------------------------------------------------------
  // UPDATE
  // -----------------------------------------------------------------------
  function update(dt) {
    if (state.phase !== 'playing') return;

    state.timeLeft -= dt;
    if (state.timeLeft <= 0) {
      endRound();
      return;
    }

    state.scrollX += state.scrollSpeed * dt;

    // Spawn components
    if (state.scrollX + W > state.nextSpawnX) {
      spawnComponent();
      state.nextSpawnX += state.spawnInterval + Math.random() * 80;
    }

    // Check for missed components (scrolled off screen left)
    for (var i = state.components.length - 1; i >= 0; i--) {
      var comp = state.components[i];
      var screenX = comp.worldX - state.scrollX;
      if (screenX < -80) {
        if (!comp.hit && !comp.erp.isArtifact) {
          comp.missed = true;
          state.misses++;
          state.combo = 0;
        }
        state.components.splice(i, 1);
      }
    }

    // Update particles
    for (var p = state.particles.length - 1; p >= 0; p--) {
      var part = state.particles[p];
      part.x += part.vx * dt;
      part.y += part.vy * dt;
      part.vy += 200 * dt; // gravity
      part.life -= dt;
      part.alpha = Math.max(0, part.life / 0.6);
      if (part.life <= 0) state.particles.splice(p, 1);
    }

    // Update floating texts
    for (var f = state.floatingTexts.length - 1; f >= 0; f--) {
      var ft = state.floatingTexts[f];
      ft.y -= 40 * dt;
      ft.life -= dt;
      if (ft.life <= 0) state.floatingTexts.splice(f, 1);
    }

    updateHUD();
  }

  // -----------------------------------------------------------------------
  // ROUND END
  // -----------------------------------------------------------------------
  function endRound() {
    state.round++;
    state.phase = 'roundEnd';

    // Show round transition
    var overlay = document.getElementById('game-overlay');
    overlay.style.display = 'flex';
    overlay.innerHTML =
      '<h2>Round ' + (state.round - 1) + ' Complete!</h2>' +
      '<p>ERPs caught: ' + state.hits + ' | Missed: ' + state.misses + '</p>' +
      '<p>Max combo: ' + state.maxCombo + 'x</p>' +
      '<p class="final-score">' + state.score.toLocaleString() + '</p>' +
      '<button class="btn-play" id="btn-next-round">Next Round</button>' +
      '<button class="btn-secondary" id="btn-end-game">End Game</button>';

    document.getElementById('btn-next-round').addEventListener('click', function() {
      initRound();
      state.phase = 'playing';
      overlay.style.display = 'none';
      lastTime = performance.now();
      requestAnimationFrame(gameLoop);
    });

    document.getElementById('btn-end-game').addEventListener('click', function() {
      showGameOver();
    });
  }

  function showGameOver() {
    state.phase = 'gameover';
    var overlay = document.getElementById('game-overlay');
    overlay.style.display = 'flex';
    overlay.innerHTML =
      '<h2>Game Over</h2>' +
      '<p>Rounds completed: ' + (state.round - 1) + '</p>' +
      '<p>Max combo: ' + state.maxCombo + 'x</p>' +
      '<p class="final-score">' + state.score.toLocaleString() + '</p>' +
      '<button class="btn-play" id="btn-restart">Play Again</button>';

    document.getElementById('btn-restart').addEventListener('click', function() {
      startGame();
    });

    CMLLeaderboard.showSubmitForm('leaderboard-container', 'erp_catcher', state.score);
  }

  // -----------------------------------------------------------------------
  // HUD UPDATE
  // -----------------------------------------------------------------------
  function updateHUD() {
    document.getElementById('hud-score').textContent = state.score.toLocaleString();
    document.getElementById('hud-round').textContent = state.round;
    document.getElementById('hud-time').textContent = Math.ceil(Math.max(0, state.timeLeft));
    document.getElementById('hud-combo').textContent = state.combo + 'x';

    var timeEl = document.getElementById('hud-time');
    if (state.timeLeft <= 10) {
      timeEl.className = 'hud-value hud-value--red';
    } else if (state.timeLeft <= 20) {
      timeEl.className = 'hud-value hud-value--amber';
    } else {
      timeEl.className = 'hud-value';
    }
  }

  // -----------------------------------------------------------------------
  // DRAW
  // -----------------------------------------------------------------------
  function draw() {
    var c = C();
    ctx.fillStyle = c.bg;
    ctx.fillRect(0, 0, W, H);

    // Draw lanes
    for (var lane = 0; lane < LANES; lane++) {
      var laneTop = LANE_TOP + lane * LANE_H;
      var laneMid = laneTop + LANE_H / 2;

      // Lane background
      ctx.fillStyle = c.lane[lane];
      ctx.fillRect(0, laneTop, W, LANE_H);

      // Lane border
      ctx.strokeStyle = c.grid;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, laneTop);
      ctx.lineTo(W, laneTop);
      ctx.stroke();

      // Lane label
      ctx.fillStyle = c.textDim;
      ctx.font = '11px Inter, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(LANE_LABELS[lane], 6, laneTop + 15);

      // Draw zero line
      ctx.strokeStyle = c.axes;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(0, laneMid);
      ctx.lineTo(W, laneMid);
      ctx.stroke();

      // Draw EEG trace
      ctx.strokeStyle = c.noise;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (var px = 0; px < W; px += 2) {
        var worldX = state.scrollX + px;
        var val = getSignalAt(lane, worldX);
        var y = laneMid - val;
        if (px === 0) ctx.moveTo(px, y);
        else ctx.lineTo(px, y);
      }
      ctx.stroke();
    }

    // Draw bottom lane border
    ctx.strokeStyle = c.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, LANE_TOP + LANES * LANE_H);
    ctx.lineTo(W, LANE_TOP + LANES * LANE_H);
    ctx.stroke();

    // Draw component indicators
    for (var i = 0; i < state.components.length; i++) {
      var comp = state.components[i];
      var screenX = comp.worldX - state.scrollX;
      if (screenX < -50 || screenX > W + 50) continue;
      if (comp.hit) continue;

      var laneY = LANE_TOP + comp.lane * LANE_H + LANE_H / 2;
      var color = c[comp.erp.colorKey];

      // Draw highlight circle
      ctx.beginPath();
      ctx.arc(screenX, laneY, comp.radius, 0, Math.PI * 2);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.6 + 0.2 * Math.sin(performance.now() * 0.005);
      ctx.stroke();
      ctx.globalAlpha = 1;

      // Draw label
      ctx.fillStyle = color;
      ctx.font = 'bold 11px Inter, sans-serif';
      ctx.textAlign = 'center';
      var labelY = laneY - comp.radius - 6;
      ctx.fillText(comp.erp.label, screenX, labelY);

      // Artifact warning indicator
      if (comp.erp.isArtifact) {
        ctx.fillStyle = color;
        ctx.font = 'bold 9px Inter, sans-serif';
        ctx.fillText('AVOID', screenX, labelY - 12);
      }
    }

    // Draw particles
    for (var p = 0; p < state.particles.length; p++) {
      var part = state.particles[p];
      ctx.globalAlpha = part.alpha;
      ctx.fillStyle = part.color;
      ctx.beginPath();
      ctx.arc(part.x, part.y, part.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Draw floating texts
    for (var f = 0; f < state.floatingTexts.length; f++) {
      var ft = state.floatingTexts[f];
      var alpha = ft.life / ft.maxLife;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = ft.color;
      ctx.font = 'bold 16px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(ft.text, ft.x, ft.y);
    }
    ctx.globalAlpha = 1;

    // Timer bar at very top
    if (state.phase === 'playing') {
      var barW = W * (state.timeLeft / state.roundDuration);
      var grad = ctx.createLinearGradient(0, 0, barW, 0);
      grad.addColorStop(0, '#5b8fd9');
      grad.addColorStop(1, '#00d68f');
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(0, 0, W, 4);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, barW, 4);
    }
  }

  // -----------------------------------------------------------------------
  // GAME LOOP
  // -----------------------------------------------------------------------
  var lastTime = 0;

  function gameLoop(now) {
    if (state.phase !== 'playing') return;

    var dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;

    update(dt);
    draw();

    requestAnimationFrame(gameLoop);
  }

  // -----------------------------------------------------------------------
  // EVENT LISTENERS
  // -----------------------------------------------------------------------
  document.getElementById('btn-start').addEventListener('click', startGame);

  // Draw initial static screen
  draw();

  // Theme change observer
  var observer = new MutationObserver(function() { draw(); });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  observer.observe(document.body, { attributes: true, attributeFilter: ['data-theme'] });

  // Handle resize
  window.addEventListener('resize', function() {
    dpr = window.devicePixelRatio || 1;
    setupCanvas();
    if (state.phase !== 'playing') draw();
  });

})();
