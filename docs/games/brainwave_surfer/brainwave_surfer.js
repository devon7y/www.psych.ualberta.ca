(function() {
  "use strict";

  // -----------------------------------------------------------------------
  // COLOR PALETTES
  // -----------------------------------------------------------------------
  var DARK = {
    bg: '#0a0e16',
    waveFill: 'rgba(20,25,36,0.4)',
    text: '#c8d8e8', textDim: '#556677',
    grid: 'rgba(60,75,95,0.2)',
    player: '#7cb3f1', playerGlow: 'rgba(124,179,241,0.5)',
    spike: '#f5a623', spikeHit: '#4CAF50', spikeMiss: '#ff6b6b',
    healthGood: '#00d68f', healthLow: '#f5a623', healthCrit: '#ff6b6b'
  };
  var LIGHT = {
    bg: '#e8ecf3',
    waveFill: 'rgba(200,210,225,0.3)',
    text: '#2c3e50', textDim: '#8899aa',
    grid: 'rgba(100,120,140,0.1)',
    player: '#2a7de9', playerGlow: 'rgba(42,125,233,0.4)',
    spike: '#e09400', spikeHit: '#2e8b40', spikeMiss: '#d04040',
    healthGood: '#00a06a', healthLow: '#d49000', healthCrit: '#d04040'
  };

  function C() {
    return document.documentElement.getAttribute('data-theme') === 'light' ? LIGHT : DARK;
  }

  // -----------------------------------------------------------------------
  // CANVAS SETUP
  // -----------------------------------------------------------------------
  var canvas = document.getElementById('game-canvas');
  var ctx = canvas.getContext('2d');
  var W = 800, H = 300;
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
  // EEG FREQUENCY BANDS
  // -----------------------------------------------------------------------
  var BANDS = {
    delta: { label: 'DELTA', freqs: [0.8, 1.5, 2.5],   amps: [35, 22, 12], color: '#e74c3c', colorLight: '#c0302a' },
    theta: { label: 'THETA', freqs: [4.0, 5.5, 7.0],   amps: [28, 18, 10], color: '#f39c12', colorLight: '#d49000' },
    alpha: { label: 'ALPHA', freqs: [8.0, 10.0, 12.0],  amps: [22, 14, 8],  color: '#2ecc71', colorLight: '#1fa855' },
    beta:  { label: 'BETA',  freqs: [15.0, 20.0, 28.0], amps: [14, 10, 5],  color: '#3498db', colorLight: '#2670a8' },
    gamma: { label: 'GAMMA', freqs: [35.0, 50.0, 70.0], amps: [8,  5,  3],  color: '#9b59b6', colorLight: '#7d4092' }
  };
  var BAND_ORDER = ['delta', 'theta', 'alpha', 'beta', 'gamma'];

  // -----------------------------------------------------------------------
  // WAVE GENERATION
  // -----------------------------------------------------------------------
  function getWaveY(worldX, band, t) {
    var params = BANDS[band];
    var y = H * 0.5;
    for (var i = 0; i < params.freqs.length; i++) {
      var f = params.freqs[i];
      var a = params.amps[i];
      y += a * Math.sin(2 * Math.PI * (f * worldX / 6000 + f * t * 0.08));
    }
    // Add a slow drift
    y += 15 * Math.sin(worldX * 0.0003 + t * 0.2);
    return y;
  }

  // -----------------------------------------------------------------------
  // GAME STATE
  // -----------------------------------------------------------------------
  var state = {
    phase: 'start', // start, playing, gameover
    t: 0,
    scrollX: 0,
    scrollSpeed: 120,

    band: 'theta',
    bandTimer: 8,
    bandCycle: 8,
    bandIndex: 1,
    bandAnnounce: 0,

    // Player
    playerScreenX: 160,
    playerY: H * 0.5,
    playerVY: 0,
    health: 100,
    onWave: false,

    // Scoring
    score: 0,
    distance: 0,
    combo: 0,
    maxCombo: 0,

    // Spikes
    spikes: [],
    nextSpikeX: 600,
    spikeInterval: 2.5,

    // Particles & floating text
    particles: [],
    floatingTexts: [],

    // Input
    jumpQueued: false
  };

  // -----------------------------------------------------------------------
  // SPIKE GENERATION
  // -----------------------------------------------------------------------
  function spawnSpike() {
    var worldX = state.scrollX + W + 50 + Math.random() * 200;
    var y = getWaveY(worldX, state.band, state.t);
    state.spikes.push({
      worldX: worldX,
      worldY: y,
      hit: false,
      missed: false,
      flash: 0
    });
    state.nextSpikeX = worldX + state.spikeInterval * state.scrollSpeed;
  }

  // -----------------------------------------------------------------------
  // START GAME
  // -----------------------------------------------------------------------
  function startGame() {
    state.phase = 'playing';
    state.t = 0;
    state.scrollX = 0;
    state.scrollSpeed = 120;
    state.band = 'theta';
    state.bandTimer = 8;
    state.bandIndex = 1;
    state.bandAnnounce = 2.0;
    state.playerY = H * 0.5;
    state.playerVY = 0;
    state.health = 100;
    state.score = 0;
    state.distance = 0;
    state.combo = 0;
    state.maxCombo = 0;
    state.spikes = [];
    state.nextSpikeX = state.scrollX + 500;
    state.spikeInterval = 2.5;
    state.particles = [];
    state.floatingTexts = [];

    document.getElementById('game-overlay').style.display = 'none';
    document.getElementById('game-hud').style.display = 'flex';
    document.getElementById('surf-instructions').style.display = 'block';

    lastTime = performance.now();
    requestAnimationFrame(gameLoop);
  }

  // -----------------------------------------------------------------------
  // INPUT HANDLING
  // -----------------------------------------------------------------------
  function onInput(e) {
    if (state.phase !== 'playing') return;
    e.preventDefault();
    state.jumpQueued = true;
  }

  canvas.addEventListener('mousedown', onInput);
  canvas.addEventListener('touchstart', onInput);

  // Keyboard support
  document.addEventListener('keydown', function(e) {
    if (state.phase !== 'playing') return;
    if (e.code === 'Space' || e.code === 'ArrowUp') {
      e.preventDefault();
      state.jumpQueued = true;
    }
  });

  // -----------------------------------------------------------------------
  // UPDATE
  // -----------------------------------------------------------------------
  function update(dt) {
    if (state.phase !== 'playing') return;

    state.t += dt;
    state.scrollX += state.scrollSpeed * dt;
    state.distance += state.scrollSpeed * dt;

    // Difficulty curve
    state.scrollSpeed = Math.min(360, 120 + state.t * 3.5);
    state.spikeInterval = Math.max(0.8, 2.5 - state.t * 0.015);

    // Band cycling
    state.bandTimer -= dt;
    if (state.bandTimer <= 0) {
      state.bandTimer = state.bandCycle;
      state.bandIndex = (state.bandIndex + 1) % BAND_ORDER.length;
      state.band = BAND_ORDER[state.bandIndex];
      state.bandAnnounce = 2.0;
    }
    if (state.bandAnnounce > 0) state.bandAnnounce -= dt;

    // Wave position at player
    var waveY = getWaveY(state.scrollX + state.playerScreenX, state.band, state.t);

    // Player physics
    var gravity = 350;
    var wavePull = 0;
    var distToWave = state.playerY - waveY;

    // Magnetic pull toward wave when close
    if (Math.abs(distToWave) < 40) {
      wavePull = -distToWave * 4;
      state.onWave = true;
    } else {
      state.onWave = false;
    }

    // Jump
    if (state.jumpQueued) {
      state.playerVY = -180;
      state.jumpQueued = false;
    }

    state.playerVY += gravity * dt;
    state.playerVY += wavePull * dt;
    state.playerVY *= 0.96; // damping
    state.playerY += state.playerVY * dt;

    // Clamp
    state.playerY = Math.max(30, Math.min(H - 30, state.playerY));

    // Health
    if (state.onWave) {
      state.health = Math.min(100, state.health + 8 * dt);
    } else {
      var decayRate = 5 + state.t * 0.3;
      state.health -= decayRate * dt;
    }

    if (state.health <= 0) {
      state.health = 0;
      gameOver();
      return;
    }

    // Distance score
    state.score = Math.floor(state.distance * 0.1);

    // Spike spawning
    if (state.scrollX + W > state.nextSpikeX) {
      spawnSpike();
    }

    // Check spikes
    for (var i = state.spikes.length - 1; i >= 0; i--) {
      var spike = state.spikes[i];
      var screenX = spike.worldX - state.scrollX;

      // Check if player hits spike (within range and jump/click)
      if (!spike.hit && !spike.missed) {
        var dx = state.playerScreenX - screenX;
        var dy = state.playerY - spike.worldY;
        if (Math.abs(dx) < 50 && Math.abs(dy) < 50) {
          // Hit!
          spike.hit = true;
          spike.flash = 0.5;
          state.combo++;
          if (state.combo > state.maxCombo) state.maxCombo = state.combo;
          var pts = 50 * Math.min(state.combo, 8);
          state.score += pts;
          state.health = Math.min(100, state.health + 5);
          spawnParticles(screenX, spike.worldY, C().spikeHit, 10);
          addFloatingText(screenX, spike.worldY - 20, '+' + pts, C().spikeHit);
        }
      }

      // Flash decay
      if (spike.flash > 0) spike.flash -= dt;

      // Missed spike (scrolled past player)
      if (!spike.hit && !spike.missed && screenX < state.playerScreenX - 60) {
        spike.missed = true;
        state.combo = 0;
        spawnParticles(screenX, spike.worldY, C().spikeMiss, 4);
      }

      // Remove off-screen
      if (screenX < -100) {
        state.spikes.splice(i, 1);
      }
    }

    // Update particles
    for (var p = state.particles.length - 1; p >= 0; p--) {
      var part = state.particles[p];
      part.x += part.vx * dt;
      part.y += part.vy * dt;
      part.vy += 150 * dt;
      part.life -= dt;
      if (part.life <= 0) state.particles.splice(p, 1);
    }

    // Update floating texts
    for (var f = state.floatingTexts.length - 1; f >= 0; f--) {
      var ft = state.floatingTexts[f];
      ft.y -= 35 * dt;
      ft.life -= dt;
      if (ft.life <= 0) state.floatingTexts.splice(f, 1);
    }

    updateHUD();
  }

  // -----------------------------------------------------------------------
  // PARTICLES & FLOATING TEXT
  // -----------------------------------------------------------------------
  function spawnParticles(x, y, color, count) {
    for (var i = 0; i < count; i++) {
      state.particles.push({
        x: x, y: y,
        vx: (Math.random() - 0.5) * 120,
        vy: -(Math.random() * 80 + 20),
        color: color,
        life: 0.5 + Math.random() * 0.3,
        size: 2 + Math.random() * 3
      });
    }
  }

  function addFloatingText(x, y, text, color) {
    state.floatingTexts.push({
      x: x, y: y, text: text, color: color,
      life: 1.0, maxLife: 1.0
    });
  }

  // -----------------------------------------------------------------------
  // GAME OVER
  // -----------------------------------------------------------------------
  function gameOver() {
    state.phase = 'gameover';
    var overlay = document.getElementById('game-overlay');
    overlay.style.display = 'flex';
    overlay.innerHTML =
      '<h2>Wipeout!</h2>' +
      '<p>Distance: ' + Math.floor(state.distance / 10) + 'm</p>' +
      '<p>Max combo: ' + state.maxCombo + 'x</p>' +
      '<p class="final-score">' + state.score.toLocaleString() + '</p>' +
      '<button class="btn-play" id="btn-restart">Surf Again</button>';

    document.getElementById('btn-restart').addEventListener('click', startGame);
    CMLLeaderboard.showSubmitForm('leaderboard-container', 'brainwave_surfer', state.score);
  }

  // -----------------------------------------------------------------------
  // HUD
  // -----------------------------------------------------------------------
  function updateHUD() {
    document.getElementById('hud-score').textContent = state.score.toLocaleString();
    document.getElementById('hud-combo').textContent = state.combo + 'x';

    var bandEl = document.getElementById('hud-band');
    var bandInfo = BANDS[state.band];
    bandEl.textContent = bandInfo.label;
    bandEl.style.color = document.documentElement.getAttribute('data-theme') === 'light'
      ? bandInfo.colorLight : bandInfo.color;

    var healthEl = document.getElementById('hud-health');
    healthEl.style.width = state.health + '%';
    if (state.health > 50) {
      healthEl.className = 'health-bar-fill';
    } else if (state.health > 25) {
      healthEl.className = 'health-bar-fill health-bar-fill--low';
    } else {
      healthEl.className = 'health-bar-fill health-bar-fill--critical';
    }
  }

  // -----------------------------------------------------------------------
  // DRAW
  // -----------------------------------------------------------------------
  function draw() {
    var c = C();
    var bandInfo = BANDS[state.band];
    var bandColor = document.documentElement.getAttribute('data-theme') === 'light'
      ? bandInfo.colorLight : bandInfo.color;

    // Background
    ctx.fillStyle = c.bg;
    ctx.fillRect(0, 0, W, H);

    // Grid lines
    ctx.strokeStyle = c.grid;
    ctx.lineWidth = 0.5;
    for (var gy = 50; gy < H; gy += 50) {
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.lineTo(W, gy);
      ctx.stroke();
    }

    // Wave path
    ctx.beginPath();
    for (var px = 0; px <= W; px += 3) {
      var worldX = state.scrollX + px;
      var y = getWaveY(worldX, state.band, state.t);
      if (px === 0) ctx.moveTo(px, y);
      else ctx.lineTo(px, y);
    }

    // Wave stroke with glow
    ctx.save();
    ctx.shadowColor = bandColor;
    ctx.shadowBlur = 15;
    ctx.strokeStyle = bandColor;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.restore();

    // Wave fill below
    ctx.lineTo(W, H);
    ctx.lineTo(0, H);
    ctx.closePath();
    ctx.fillStyle = c.waveFill;
    ctx.fill();

    // Draw spikes
    for (var s = 0; s < state.spikes.length; s++) {
      var spike = state.spikes[s];
      var sx = spike.worldX - state.scrollX;
      if (sx < -50 || sx > W + 50) continue;

      if (spike.hit) {
        // Hit spike: green flash
        if (spike.flash > 0) {
          ctx.globalAlpha = spike.flash * 2;
          ctx.fillStyle = c.spikeHit;
          ctx.beginPath();
          ctx.arc(sx, spike.worldY, 12 + (0.5 - spike.flash) * 20, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
        continue;
      }

      if (spike.missed) continue;

      // Active spike: pulsing yellow triangle/marker
      var pulseSize = 1 + 0.15 * Math.sin(state.t * 8);
      ctx.save();
      ctx.translate(sx, spike.worldY);
      ctx.scale(pulseSize, pulseSize);

      // Diamond shape
      ctx.fillStyle = c.spike;
      ctx.shadowColor = c.spike;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.moveTo(0, -14);
      ctx.lineTo(8, 0);
      ctx.lineTo(0, 14);
      ctx.lineTo(-8, 0);
      ctx.closePath();
      ctx.fill();

      // Inner highlight
      ctx.fillStyle = '#fff';
      ctx.globalAlpha = 0.4;
      ctx.beginPath();
      ctx.arc(0, 0, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      ctx.restore();

      // "HIT" zone indicator when near player
      if (Math.abs(sx - state.playerScreenX) < 80) {
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = c.spike;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(sx, spike.worldY, 30, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      }
    }

    // Draw player
    var waveYAtPlayer = getWaveY(state.scrollX + state.playerScreenX, state.band, state.t);
    ctx.save();
    ctx.shadowColor = c.playerGlow;
    ctx.shadowBlur = 20;

    // Outer glow
    var gradient = ctx.createRadialGradient(
      state.playerScreenX, state.playerY, 0,
      state.playerScreenX, state.playerY, 16
    );
    gradient.addColorStop(0, c.player);
    gradient.addColorStop(0.5, c.playerGlow);
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(state.playerScreenX, state.playerY, 16, 0, Math.PI * 2);
    ctx.fill();

    // Core
    ctx.fillStyle = c.player;
    ctx.beginPath();
    ctx.arc(state.playerScreenX, state.playerY, 7, 0, Math.PI * 2);
    ctx.fill();

    // White center
    ctx.fillStyle = '#fff';
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.arc(state.playerScreenX, state.playerY, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();

    // Trail
    ctx.globalAlpha = 0.15;
    ctx.fillStyle = c.player;
    for (var tr = 1; tr <= 4; tr++) {
      var trailX = state.playerScreenX - tr * 12;
      var trailWorldX = state.scrollX + trailX;
      var trailWaveY = getWaveY(trailWorldX, state.band, state.t - tr * 0.02);
      var trailY = state.playerY + (trailWaveY - waveYAtPlayer) * 0.3;
      ctx.beginPath();
      ctx.arc(trailX, trailY, 5 - tr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Draw particles
    for (var p = 0; p < state.particles.length; p++) {
      var part = state.particles[p];
      ctx.globalAlpha = Math.max(0, part.life / 0.5);
      ctx.fillStyle = part.color;
      ctx.beginPath();
      ctx.arc(part.x, part.y, part.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Draw floating texts
    for (var f = 0; f < state.floatingTexts.length; f++) {
      var ft = state.floatingTexts[f];
      ctx.globalAlpha = ft.life / ft.maxLife;
      ctx.fillStyle = ft.color;
      ctx.font = 'bold 14px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(ft.text, ft.x, ft.y);
    }
    ctx.globalAlpha = 1;

    // Band announcement
    if (state.bandAnnounce > 0 && state.phase === 'playing') {
      var annoAlpha = Math.min(1, state.bandAnnounce * 2) * (state.bandAnnounce > 0.3 ? 1 : state.bandAnnounce / 0.3);
      ctx.globalAlpha = annoAlpha * 0.8;
      ctx.fillStyle = bandColor;
      ctx.font = 'bold 36px Playfair Display, Georgia, serif';
      ctx.textAlign = 'center';
      ctx.save();
      ctx.shadowColor = bandColor;
      ctx.shadowBlur = 30;
      ctx.fillText(bandInfo.label + ' WAVES', W / 2, H / 2);
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    // Distance meter at bottom
    if (state.phase === 'playing') {
      ctx.fillStyle = c.textDim;
      ctx.font = '11px Inter, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(Math.floor(state.distance / 10) + 'm', W - 10, H - 8);
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

  window.addEventListener('resize', function() {
    dpr = window.devicePixelRatio || 1;
    setupCanvas();
    if (state.phase !== 'playing') draw();
  });

})();
