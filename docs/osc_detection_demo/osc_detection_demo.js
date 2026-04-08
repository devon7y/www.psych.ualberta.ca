/**
 * Classic Oscillation Detection — Issues
 * Computational Memory Lab, University of Alberta
 *
 * A short transition demo between "How EEG Works" and "BOSC" that illustrates:
 *   1. Fourier Transform — decomposes signal into frequencies, but loses time info
 *   2. Wavelet Transform — recovers time info via sliding wavelet
 *   3. The Limitation — power ≠ oscillation; transients fool both methods
 *
 * References:
 *   Brigham (1974) The Fast Fourier Transform
 *   Whitten et al. (2011) NeuroImage
 */
(function () {
  "use strict";

  // =====================================================================
  // CONFIGURATION
  // =====================================================================
  const SR = 256;
  const DURATION = 2; // seconds
  const N = SR * DURATION; // 512 samples
  const TWO_PI = 2 * Math.PI;

  // Signal: sum of n*cos(n*omega*t), omega = 10*2*pi, n=1..5
  // Matches the user's Image #1
  const BASE_FREQ = 10; // Hz
  const N_HARMONICS = 5;

  // Wavelet animation
  const WAVELET_FREQ = 10; // Hz — the wavelet we slide across
  const WAVELET_CYCLES = 5;

  const PREFIX = "osc"; // Element ID prefix

  const COLORS = {
    signal: "#e85454",
    signalFaint: "rgba(232, 84, 84, 0.3)",
    spectrum: "#5b8fd9",
    spectrumFill: "rgba(91, 143, 217, 0.2)",
    wavelet: "#ff9800",
    waveletFill: "rgba(255, 152, 0, 0.15)",
    tfHot: "#ff4444",
    tfWarm: "#ff9800",
    tfCool: "#5b8fd9",
    tfCold: "#141924",
    detected: "#4CAF50",
    detectedGlow: "rgba(76, 175, 80, 0.3)",
    transient: "#ff6b6b",
    transientGlow: "rgba(255, 107, 107, 0.3)",
    axes: "#556677",
    axesLabel: "#8899aa",
    text: "#c8d8e8",
    gridLine: "rgba(60, 75, 95, 0.5)",
    canvasBg: "#141924",
    imageBorder: "#3a4254",
  };

  // =====================================================================
  // MATH
  // =====================================================================

  function generateHarmonicSignal() {
    const signal = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      const t = i / SR;
      let val = 0;
      for (let n = 1; n <= N_HARMONICS; n++) {
        val += n * Math.cos(n * BASE_FREQ * TWO_PI * t);
      }
      signal[i] = val;
    }
    return signal;
  }

  // DFT magnitude (brute-force, N is small)
  function computeSpectrum(signal) {
    const freqBins = Math.floor(N / 2);
    const magnitudes = new Float64Array(freqBins);
    for (let k = 0; k < freqBins; k++) {
      let re = 0, im = 0;
      for (let n = 0; n < N; n++) {
        const angle = TWO_PI * k * n / N;
        re += signal[n] * Math.cos(angle);
        im -= signal[n] * Math.sin(angle);
      }
      magnitudes[k] = Math.sqrt(re * re + im * im) / N;
    }
    return magnitudes;
  }

  // Generate a signal with a BURST of oscillation in the middle + a sharp transient
  function generateBurstSignal() {
    const sig = new Float64Array(N);
    // 1/f-ish background
    for (let i = 0; i < N; i++) {
      sig[i] = 0.3 * Math.sin(TWO_PI * 3 * i / SR) + 0.15 * Math.sin(TWO_PI * 7 * i / SR + 1.2);
    }
    // Oscillation burst: 10 Hz from t=0.5 to t=1.3s
    const burstStart = Math.round(0.5 * SR);
    const burstEnd = Math.round(1.3 * SR);
    for (let i = burstStart; i < burstEnd; i++) {
      const env = 0.5 * (1 - Math.cos(TWO_PI * (i - burstStart) / (burstEnd - burstStart)));
      sig[i] += 2.0 * env * Math.sin(TWO_PI * 10 * i / SR);
    }
    // Sharp transient at t=1.7s (one big bump, not rhythmic)
    const transientCenter = Math.round(1.7 * SR);
    const transientWidth = Math.round(0.04 * SR); // ~40ms
    for (let i = transientCenter - transientWidth; i < transientCenter + transientWidth && i < N; i++) {
      if (i < 0) continue;
      const d = (i - transientCenter) / transientWidth;
      sig[i] += 3.5 * Math.exp(-d * d * 4);
    }
    return sig;
  }

  // Morlet wavelet convolution at a single frequency across time
  function waveletConvolveSingle(signal, freq, nCycles) {
    const sigmaT = nCycles / (TWO_PI * freq);
    const halfLen = Math.ceil(3 * sigmaT * SR);
    const power = new Float64Array(signal.length);
    for (let t = 0; t < signal.length; t++) {
      let re = 0, im = 0;
      for (let k = -halfLen; k <= halfLen; k++) {
        const idx = t + k;
        if (idx < 0 || idx >= signal.length) continue;
        const tau = k / SR;
        const envelope = Math.exp(-tau * tau / (2 * sigmaT * sigmaT));
        re += signal[idx] * envelope * Math.cos(TWO_PI * freq * tau);
        im += signal[idx] * envelope * Math.sin(TWO_PI * freq * tau);
      }
      power[t] = re * re + im * im;
    }
    return power;
  }

  // Time-frequency map for multiple frequencies
  function computeTFMap(signal, freqs, nCycles) {
    const map = [];
    for (let fi = 0; fi < freqs.length; fi++) {
      map.push(waveletConvolveSingle(signal, freqs[fi], nCycles));
    }
    return map;
  }

  // =====================================================================
  // CANVAS DRAWING UTILITIES
  // =====================================================================

  function getCanvasColors() {
    const isLight = document.documentElement.getAttribute("data-theme") === "light";
    if (isLight) {
      return {
        ...COLORS,
        signal: "#c0392b",
        signalFaint: "rgba(192, 57, 43, 0.25)",
        spectrum: "#2c5282",
        axes: "#718096",
        axesLabel: "#4a5568",
        text: "#2d3748",
        gridLine: "rgba(160, 174, 192, 0.4)",
        canvasBg: "#f7fafc",
        imageBorder: "#e0e6ed",
      };
    }
    return COLORS;
  }

  function clearCanvas(ctx, w, h) {
    ctx.fillStyle = getCanvasColors().canvasBg;
    ctx.fillRect(0, 0, w, h);
  }

  function drawText(ctx, text, x, y, opts) {
    opts = opts || {};
    var c = getCanvasColors();
    ctx.fillStyle = opts.color || c.text;
    ctx.font = opts.font || '11px "Inter", sans-serif';
    ctx.textAlign = opts.align || "left";
    ctx.textBaseline = opts.baseline || "middle";
    ctx.fillText(text, x, y);
  }

  // =====================================================================
  // STEP 1: FOURIER TRANSFORM — ANIMATED
  // =====================================================================

  var fourierAnimState = {
    position: 0, // 0 to 1
    animId: null,
    running: false,
    signal: null,
    spectrum: null,
  };

  function generateStep1Data() {
    if (!fourierAnimState.signal) {
      fourierAnimState.signal = generateHarmonicSignal();
      fourierAnimState.spectrum = computeSpectrum(fourierAnimState.signal);
    }
  }

  function startFourierAnimation() {
    if (fourierAnimState.running) return;
    fourierAnimState.running = true;
    fourierAnimState.position = 0;
    var startTime = null;
    var animDuration = 6000; // 6 seconds

    function tick(timestamp) {
      if (!fourierAnimState.running) return;
      if (!startTime) startTime = timestamp;
      var elapsed = timestamp - startTime;
      fourierAnimState.position = Math.min(1, elapsed / animDuration);
      render();
      if (fourierAnimState.position < 1) {
        fourierAnimState.animId = requestAnimationFrame(tick);
      } else {
        fourierAnimState.running = false;
      }
    }
    fourierAnimState.animId = requestAnimationFrame(tick);
  }

  function stopFourierAnimation() {
    fourierAnimState.running = false;
    if (fourierAnimState.animId) {
      cancelAnimationFrame(fourierAnimState.animId);
      fourierAnimState.animId = null;
    }
  }

  function resetFourierAnimation() {
    stopFourierAnimation();
    fourierAnimState.position = 0;
  }

  // Which harmonic index (0-based) the animation is currently showing
  // We sweep through test frequencies 1..maxFreqHz, pausing at each harmonic
  function getFourierAnimFreq(pos) {
    // Map position 0..1 to frequency 0..maxFreqHz
    var maxFreqHz = 60;
    return pos * maxFreqHz;
  }

  function drawStep1(canvas) {
    var ctx = canvas.getContext("2d");
    var dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var W = canvas.width / dpr, H = canvas.height / dpr;
    var c = getCanvasColors();
    clearCanvas(ctx, W, H);

    generateStep1Data();
    var signal = fourierAnimState.signal;
    var spectrum = fourierAnimState.spectrum;
    var pos = fourierAnimState.position;
    var currentFreq = getFourierAnimFreq(pos);

    var margin = { top: 28, right: 15, bottom: 32, left: 50 };
    var plotW = W - margin.left - margin.right;
    var plotH = (H - margin.top - margin.bottom - 30) / 2;
    var gap = 30;
    var maxFreqHz = 60;

    // Title
    drawText(ctx, "Fourier Transform: Testing Each Frequency Against the Signal", margin.left + plotW / 2, 14, {
      font: 'bold 12px "Inter", sans-serif', align: "center"
    });

    // --- TOP: Signal with current test sine overlaid ---
    var minVal = Infinity, maxVal = -Infinity;
    for (var i = 0; i < N; i++) {
      if (signal[i] < minVal) minVal = signal[i];
      if (signal[i] > maxVal) maxVal = signal[i];
    }
    var range = maxVal - minVal || 1;
    var mid = (maxVal + minVal) / 2;

    // Grid
    ctx.strokeStyle = c.gridLine; ctx.lineWidth = 0.5;
    for (var t = 0; t <= DURATION; t += 0.5) {
      var gx = margin.left + (t / DURATION) * plotW;
      ctx.beginPath(); ctx.moveTo(gx, margin.top); ctx.lineTo(gx, margin.top + plotH); ctx.stroke();
    }

    // Signal trace
    ctx.strokeStyle = c.signal; ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (i = 0; i < N; i++) {
      var x = margin.left + (i / N) * plotW;
      var y = margin.top + plotH / 2 - ((signal[i] - mid) / range) * plotH * 0.85;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Overlay: test sine wave spanning entire signal (full width = no time localization)
    if (currentFreq > 0.5) {
      // Draw a semi-transparent filled region to show the test sine covers ALL time
      ctx.fillStyle = "rgba(255, 152, 0, 0.06)";
      ctx.fillRect(margin.left, margin.top, plotW, plotH);

      ctx.strokeStyle = c.wavelet; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.8;
      ctx.beginPath();
      for (i = 0; i < N; i++) {
        x = margin.left + (i / N) * plotW;
        var sineVal = Math.cos(TWO_PI * currentFreq * i / SR);
        y = margin.top + plotH / 2 - sineVal * plotH * 0.35;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.globalAlpha = 1.0;

      // Label
      drawText(ctx, "Testing: " + currentFreq.toFixed(0) + " Hz", margin.left + plotW - 5, margin.top + 12, {
        align: "right", font: 'bold 10px "Inter", sans-serif', color: c.wavelet
      });
      drawText(ctx, "(covers entire signal \u2014 no time info)", margin.left + plotW - 5, margin.top + 24, {
        align: "right", font: '9px "Inter", sans-serif', color: c.axesLabel
      });
    }

    // Axes
    ctx.strokeStyle = c.axes; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(margin.left, margin.top);
    ctx.lineTo(margin.left, margin.top + plotH);
    ctx.lineTo(margin.left + plotW, margin.top + plotH);
    ctx.stroke();

    drawText(ctx, "Time (s)", margin.left + plotW / 2, margin.top + plotH + 14, {
      align: "center", color: c.axesLabel, font: '10px "Inter", sans-serif'
    });
    for (t = 0; t <= DURATION; t += 0.5) {
      drawText(ctx, t.toFixed(1), margin.left + (t / DURATION) * plotW, margin.top + plotH + 5, {
        align: "center", color: c.axesLabel, font: '9px "Inter", sans-serif'
      });
    }

    // Arrow
    var arrowY = margin.top + plotH + gap / 2 + 2;
    var arrowX = margin.left + plotW / 2;
    ctx.strokeStyle = c.axesLabel; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(arrowX, arrowY - 8); ctx.lineTo(arrowX, arrowY + 8); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(arrowX - 4, arrowY + 4); ctx.lineTo(arrowX, arrowY + 8); ctx.lineTo(arrowX + 4, arrowY + 4);
    ctx.stroke();
    drawText(ctx, "DFT", arrowX + 10, arrowY, {
      font: 'bold 10px "Inter", sans-serif', color: c.spectrum
    });

    // --- BOTTOM: Spectrum building up progressively ---
    var specTop = margin.top + plotH + gap;
    var maxBin = Math.min(Math.floor(maxFreqHz * N / SR), spectrum.length);
    var specMax = 0;
    for (i = 0; i < maxBin; i++) {
      if (spectrum[i] > specMax) specMax = spectrum[i];
    }
    specMax = specMax || 1;

    // Grid
    ctx.strokeStyle = c.gridLine; ctx.lineWidth = 0.5;
    for (var f = 10; f <= maxFreqHz; f += 10) {
      gx = margin.left + (f / maxFreqHz) * plotW;
      ctx.beginPath(); ctx.moveTo(gx, specTop); ctx.lineTo(gx, specTop + plotH); ctx.stroke();
    }

    // Spectrum fill — only up to currentFreq
    var currentBin = Math.min(Math.floor(currentFreq * N / SR), maxBin);
    ctx.fillStyle = c.spectrumFill;
    ctx.beginPath();
    ctx.moveTo(margin.left, specTop + plotH);
    for (i = 1; i <= currentBin && i < maxBin; i++) {
      var freqHz = i * SR / N;
      x = margin.left + (freqHz / maxFreqHz) * plotW;
      y = specTop + plotH - (spectrum[i] / specMax) * plotH * 0.9;
      ctx.lineTo(x, y);
    }
    if (currentBin > 0) {
      var lastFreq = Math.min(currentBin, maxBin - 1) * SR / N;
      ctx.lineTo(margin.left + (lastFreq / maxFreqHz) * plotW, specTop + plotH);
    }
    ctx.closePath();
    ctx.fill();

    // Spectrum line
    ctx.strokeStyle = c.spectrum; ctx.lineWidth = 1.5;
    ctx.beginPath();
    var started = false;
    for (i = 1; i <= currentBin && i < maxBin; i++) {
      freqHz = i * SR / N;
      x = margin.left + (freqHz / maxFreqHz) * plotW;
      y = specTop + plotH - (spectrum[i] / specMax) * plotH * 0.9;
      if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Peak labels for harmonics revealed so far
    for (var n = 1; n <= N_HARMONICS; n++) {
      var peakFreq = n * BASE_FREQ;
      if (peakFreq > currentFreq) break;
      var px = margin.left + (peakFreq / maxFreqHz) * plotW;
      var peakBin = Math.round(peakFreq * N / SR);
      if (peakBin < spectrum.length) {
        var py = specTop + plotH - (spectrum[peakBin] / specMax) * plotH * 0.9;
        ctx.fillStyle = c.spectrum;
        ctx.beginPath(); ctx.arc(px, py, 3, 0, TWO_PI); ctx.fill();
        drawText(ctx, peakFreq + " Hz", px, py - 10, {
          align: "center", font: '9px "Inter", sans-serif', color: c.spectrum
        });
      }
    }

    // Dim area beyond current freq
    if (currentBin < maxBin) {
      var dimX = margin.left + (currentFreq / maxFreqHz) * plotW;
      ctx.fillStyle = c.canvasBg;
      ctx.globalAlpha = 0.7;
      ctx.fillRect(dimX, specTop, margin.left + plotW - dimX, plotH);
      ctx.globalAlpha = 1.0;
    }

    // Scanning line on spectrum
    if (currentFreq > 0.5 && currentFreq < maxFreqHz) {
      var scanX = margin.left + (currentFreq / maxFreqHz) * plotW;
      ctx.strokeStyle = c.wavelet; ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(scanX, specTop); ctx.lineTo(scanX, specTop + plotH); ctx.stroke();
      ctx.setLineDash([]);
    }

    // Axes
    ctx.strokeStyle = c.axes; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(margin.left, specTop);
    ctx.lineTo(margin.left, specTop + plotH);
    ctx.lineTo(margin.left + plotW, specTop + plotH);
    ctx.stroke();

    drawText(ctx, "Frequency (Hz)", margin.left + plotW / 2, specTop + plotH + 14, {
      align: "center", color: c.axesLabel, font: '10px "Inter", sans-serif'
    });
    for (f = 0; f <= maxFreqHz; f += 10) {
      drawText(ctx, f + "", margin.left + (f / maxFreqHz) * plotW, specTop + plotH + 5, {
        align: "center", color: c.axesLabel, font: '9px "Inter", sans-serif'
      });
    }

    ctx.save();
    ctx.translate(14, specTop + plotH / 2); ctx.rotate(-Math.PI / 2);
    drawText(ctx, "Amplitude", 0, 0, { align: "center", color: c.axesLabel, font: '10px "Inter", sans-serif' });
    ctx.restore();

    ctx.save();
    ctx.translate(14, margin.top + plotH / 2); ctx.rotate(-Math.PI / 2);
    drawText(ctx, "Amplitude", 0, 0, { align: "center", color: c.axesLabel, font: '10px "Inter", sans-serif' });
    ctx.restore();
  }

  // =====================================================================
  // STEP 2: WAVELET TRANSFORM — SLIDING ANIMATION
  // =====================================================================

  var waveletAnimState = {
    position: 0, // 0 to 1
    animId: null,
    running: false,
    burstSignal: null,
    tfMap: null,
  };

  function generateStep2Data() {
    if (!waveletAnimState.burstSignal) {
      waveletAnimState.burstSignal = generateBurstSignal();
      var freqs = [];
      for (var f = 4; f <= 30; f += 1) freqs.push(f);
      waveletAnimState.tfMap = computeTFMap(waveletAnimState.burstSignal, freqs, WAVELET_CYCLES);
      waveletAnimState.tfFreqs = freqs;
    }
  }

  function drawStep2(canvas) {
    var ctx = canvas.getContext("2d");
    var dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var W = canvas.width / dpr, H = canvas.height / dpr;
    var c = getCanvasColors();
    clearCanvas(ctx, W, H);

    generateStep2Data();
    var signal = waveletAnimState.burstSignal;
    var pos = waveletAnimState.position;

    var margin = { top: 28, right: 15, bottom: 32, left: 50 };
    var plotW = W - margin.left - margin.right;
    var signalH = (H - margin.top - margin.bottom - 20) * 0.35;
    var tfH = (H - margin.top - margin.bottom - 20) * 0.55;
    var gap = (H - margin.top - margin.bottom - 20) * 0.1;

    drawText(ctx, "Wavelet Transform: Sliding a Wavelet Across the Signal", margin.left + plotW / 2, 14, {
      font: 'bold 12px "Inter", sans-serif', align: "center"
    });

    // --- TOP: Signal with wavelet overlay ---
    var sigTop = margin.top;

    // Find signal range
    var minVal = Infinity, maxVal = -Infinity;
    for (var i = 0; i < N; i++) {
      if (signal[i] < minVal) minVal = signal[i];
      if (signal[i] > maxVal) maxVal = signal[i];
    }
    var range = maxVal - minVal || 1;
    var mid = (maxVal + minVal) / 2;

    // Wavelet position — which sample is the center
    var waveletCenter = Math.floor(pos * (N - 1));
    var sigmaT = WAVELET_CYCLES / (TWO_PI * WAVELET_FREQ);
    var halfLen = Math.ceil(3 * sigmaT * SR);

    // Draw wavelet envelope (Gaussian window)
    ctx.fillStyle = c.waveletFill;
    ctx.beginPath();
    var envBottom = sigTop + signalH;
    ctx.moveTo(margin.left + Math.max(0, (waveletCenter - halfLen) / N) * plotW, envBottom);
    for (var k = -halfLen; k <= halfLen; k++) {
      var idx = waveletCenter + k;
      if (idx < 0 || idx >= N) continue;
      var tau = k / SR;
      var envelope = Math.exp(-tau * tau / (2 * sigmaT * sigmaT));
      var ex = margin.left + (idx / N) * plotW;
      var ey = sigTop + signalH / 2 - envelope * signalH * 0.42;
      ctx.lineTo(ex, ey);
    }
    ctx.lineTo(margin.left + Math.min(N - 1, (waveletCenter + halfLen)) / N * plotW, envBottom);
    ctx.closePath();
    ctx.fill();

    // Also draw bottom envelope
    ctx.fillStyle = c.waveletFill;
    ctx.beginPath();
    ctx.moveTo(margin.left + Math.max(0, (waveletCenter - halfLen) / N) * plotW, envBottom);
    for (k = -halfLen; k <= halfLen; k++) {
      idx = waveletCenter + k;
      if (idx < 0 || idx >= N) continue;
      tau = k / SR;
      envelope = Math.exp(-tau * tau / (2 * sigmaT * sigmaT));
      ex = margin.left + (idx / N) * plotW;
      ey = sigTop + signalH / 2 + envelope * signalH * 0.42;
      ctx.lineTo(ex, ey);
    }
    ctx.lineTo(margin.left + Math.min(N - 1, (waveletCenter + halfLen)) / N * plotW, sigTop);
    ctx.closePath();
    ctx.fill();

    // Wavelet oscillation itself
    ctx.strokeStyle = c.wavelet;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    var started = false;
    for (k = -halfLen; k <= halfLen; k++) {
      idx = waveletCenter + k;
      if (idx < 0 || idx >= N) continue;
      tau = k / SR;
      envelope = Math.exp(-tau * tau / (2 * sigmaT * sigmaT));
      var wavVal = envelope * Math.cos(TWO_PI * WAVELET_FREQ * tau);
      ex = margin.left + (idx / N) * plotW;
      ey = sigTop + signalH / 2 - wavVal * signalH * 0.4;
      if (!started) { ctx.moveTo(ex, ey); started = true; } else ctx.lineTo(ex, ey);
    }
    ctx.stroke();

    // Signal trace
    ctx.strokeStyle = c.signal;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (i = 0; i < N; i++) {
      var x = margin.left + (i / N) * plotW;
      var y = sigTop + signalH / 2 - ((signal[i] - mid) / range) * signalH * 0.85;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Vertical line at wavelet center
    var centerX = margin.left + (waveletCenter / N) * plotW;
    ctx.strokeStyle = c.wavelet;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(centerX, sigTop);
    ctx.lineTo(centerX, sigTop + signalH + gap + tfH);
    ctx.stroke();
    ctx.setLineDash([]);

    // Signal axes
    ctx.strokeStyle = c.axes; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(margin.left, sigTop);
    ctx.lineTo(margin.left, sigTop + signalH);
    ctx.lineTo(margin.left + plotW, sigTop + signalH);
    ctx.stroke();

    // Labels — mark the burst and transient
    var burstStartX = margin.left + (0.5 / DURATION) * plotW;
    var burstEndX = margin.left + (1.3 / DURATION) * plotW;
    ctx.fillStyle = c.detectedGlow;
    ctx.fillRect(burstStartX, sigTop, burstEndX - burstStartX, signalH);
    drawText(ctx, "oscillation", (burstStartX + burstEndX) / 2, sigTop + 10, {
      align: "center", font: '9px "Inter", sans-serif', color: c.detected
    });

    var transX = margin.left + (1.7 / DURATION) * plotW;
    drawText(ctx, "transient", transX, sigTop - 4, {
      align: "center", font: '9px "Inter", sans-serif', color: c.transient
    });

    // --- BOTTOM: Time-frequency map ---
    var tfTop = sigTop + signalH + gap;
    var tfMap = waveletAnimState.tfMap;
    var freqs = waveletAnimState.tfFreqs;

    // Find power range
    var pMax = 0;
    for (var fi = 0; fi < tfMap.length; fi++) {
      for (i = 0; i < N; i++) {
        if (tfMap[fi][i] > pMax) pMax = tfMap[fi][i];
      }
    }
    pMax = pMax || 1;

    // Draw TF map as colored rectangles
    var cellW = plotW / N;
    var cellH = tfH / freqs.length;
    for (fi = 0; fi < freqs.length; fi++) {
      for (i = 0; i < N; i++) {
        // Only show up to the wavelet position
        if (i > waveletCenter + halfLen / 2) continue;
        var power = tfMap[fi][i] / pMax;
        // Color: blue->yellow->red
        var r, g, b;
        if (power < 0.33) {
          var t = power / 0.33;
          r = Math.round(20 + t * 71);
          g = Math.round(25 + t * 118);
          b = Math.round(36 + t * 181);
        } else if (power < 0.66) {
          t = (power - 0.33) / 0.33;
          r = Math.round(91 + t * 164);
          g = Math.round(143 + t * 9);
          b = Math.round(217 - t * 217);
        } else {
          t = (power - 0.66) / 0.34;
          r = 255;
          g = Math.round(152 - t * 108);
          b = 0;
        }
        ctx.fillStyle = "rgb(" + r + "," + g + "," + b + ")";
        var rectX = margin.left + (i / N) * plotW;
        // Frequencies: bottom = low, top = high
        var rectY = tfTop + (1 - (fi + 1) / freqs.length) * tfH;
        ctx.fillRect(rectX, rectY, Math.ceil(cellW) + 1, Math.ceil(cellH) + 1);
      }
    }

    // Dim area beyond wavelet position
    if (waveletCenter + halfLen / 2 < N) {
      var dimX = margin.left + ((waveletCenter + halfLen / 2) / N) * plotW;
      ctx.fillStyle = c.canvasBg;
      ctx.globalAlpha = 0.7;
      ctx.fillRect(dimX, tfTop, margin.left + plotW - dimX, tfH);
      ctx.globalAlpha = 1.0;
    }

    // TF axes
    ctx.strokeStyle = c.axes; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(margin.left, tfTop);
    ctx.lineTo(margin.left, tfTop + tfH);
    ctx.lineTo(margin.left + plotW, tfTop + tfH);
    ctx.stroke();

    drawText(ctx, "Time (s)", margin.left + plotW / 2, tfTop + tfH + 14, {
      align: "center", color: c.axesLabel, font: '10px "Inter", sans-serif'
    });
    for (var ts = 0; ts <= DURATION; ts += 0.5) {
      drawText(ctx, ts.toFixed(1), margin.left + (ts / DURATION) * plotW, tfTop + tfH + 5, {
        align: "center", color: c.axesLabel, font: '9px "Inter", sans-serif'
      });
    }

    ctx.save();
    ctx.translate(14, tfTop + tfH / 2); ctx.rotate(-Math.PI / 2);
    drawText(ctx, "Frequency (Hz)", 0, 0, { align: "center", color: c.axesLabel, font: '10px "Inter", sans-serif' });
    ctx.restore();

    // Freq labels
    var labelFreqs = [5, 10, 15, 20, 25, 30];
    for (i = 0; i < labelFreqs.length; i++) {
      var lf = labelFreqs[i];
      var fi2 = lf - freqs[0];
      if (fi2 >= 0 && fi2 < freqs.length) {
        var ly = tfTop + (1 - (fi2 + 0.5) / freqs.length) * tfH;
        drawText(ctx, lf + "", margin.left - 8, ly, {
          align: "right", color: c.axesLabel, font: '9px "Inter", sans-serif'
        });
      }
    }
  }

  // (Step 2 right panel removed — wavelet animation is full-width)

  // =====================================================================
  // STEP 3: THE LIMITATION — POWER ≠ OSCILLATION
  // =====================================================================

  function drawStep3(canvas) {
    var ctx = canvas.getContext("2d");
    var dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var W = canvas.width / dpr, H = canvas.height / dpr;
    var c = getCanvasColors();
    clearCanvas(ctx, W, H);

    generateStep2Data();
    var signal = waveletAnimState.burstSignal;

    var margin = { top: 28, right: 15, bottom: 32, left: 50 };
    var plotW = W - margin.left - margin.right;
    var signalH = (H - margin.top - margin.bottom - 20) * 0.35;
    var powerH = (H - margin.top - margin.bottom - 20) * 0.50;
    var gap = (H - margin.top - margin.bottom - 20) * 0.15;

    drawText(ctx, "The Problem: Power \u2260 Oscillation", margin.left + plotW / 2, 14, {
      font: 'bold 12px "Inter", sans-serif', align: "center"
    });

    // --- TOP: Signal ---
    var sigTop = margin.top;
    var minVal = Infinity, maxVal = -Infinity;
    for (var i = 0; i < N; i++) {
      if (signal[i] < minVal) minVal = signal[i];
      if (signal[i] > maxVal) maxVal = signal[i];
    }
    var range = maxVal - minVal || 1;
    var mid = (maxVal + minVal) / 2;

    // Highlight burst region
    var burstStartX = margin.left + (0.5 / DURATION) * plotW;
    var burstEndX = margin.left + (1.3 / DURATION) * plotW;
    ctx.fillStyle = c.detectedGlow;
    ctx.fillRect(burstStartX, sigTop, burstEndX - burstStartX, signalH);

    // Highlight transient region
    var transStartX = margin.left + (1.62 / DURATION) * plotW;
    var transEndX = margin.left + (1.78 / DURATION) * plotW;
    ctx.fillStyle = c.transientGlow;
    ctx.fillRect(transStartX, sigTop, transEndX - transStartX, signalH);

    // Signal trace
    ctx.strokeStyle = c.signal; ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (i = 0; i < N; i++) {
      var x = margin.left + (i / N) * plotW;
      var y = sigTop + signalH / 2 - ((signal[i] - mid) / range) * signalH * 0.85;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Labels
    drawText(ctx, "Real oscillation", (burstStartX + burstEndX) / 2, sigTop + 10, {
      align: "center", font: '9px "Inter", sans-serif', color: c.detected
    });
    drawText(ctx, "Transient", (transStartX + transEndX) / 2, sigTop - 4, {
      align: "center", font: '9px "Inter", sans-serif', color: c.transient
    });

    // Signal axes
    ctx.strokeStyle = c.axes; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(margin.left, sigTop);
    ctx.lineTo(margin.left, sigTop + signalH);
    ctx.lineTo(margin.left + plotW, sigTop + signalH);
    ctx.stroke();

    // --- BOTTOM: Wavelet power at 10 Hz over time ---
    var pwrTop = sigTop + signalH + gap;
    var power10 = waveletConvolveSingle(signal, 10, WAVELET_CYCLES);
    var pMax = 0;
    for (i = 0; i < N; i++) { if (power10[i] > pMax) pMax = power10[i]; }
    pMax = pMax || 1;

    drawText(ctx, "Wavelet Power at 10 Hz", margin.left + plotW / 2, pwrTop - 8, {
      font: 'bold 11px "Inter", sans-serif', align: "center"
    });

    // Highlight regions in power plot too
    ctx.fillStyle = c.detectedGlow;
    ctx.fillRect(burstStartX, pwrTop, burstEndX - burstStartX, powerH);
    ctx.fillStyle = c.transientGlow;
    ctx.fillRect(transStartX, pwrTop, transEndX - transStartX, powerH);

    // Power trace
    ctx.strokeStyle = c.spectrum; ctx.lineWidth = 2;
    ctx.beginPath();
    for (i = 0; i < N; i++) {
      x = margin.left + (i / N) * plotW;
      y = pwrTop + powerH - (power10[i] / pMax) * powerH * 0.9;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Question mark callouts
    var transientPowerX = margin.left + (1.7 / DURATION) * plotW;
    var burstPowerX = margin.left + (0.9 / DURATION) * plotW;

    // Find approximate power at transient peak
    var transIdx = Math.round(1.7 * SR);
    var burstIdx = Math.round(0.9 * SR);
    var transY = pwrTop + powerH - (power10[Math.min(transIdx, N - 1)] / pMax) * powerH * 0.9;
    var burstY = pwrTop + powerH - (power10[Math.min(burstIdx, N - 1)] / pMax) * powerH * 0.9;

    // Arrows pointing to both peaks
    drawText(ctx, "\u2713 Rhythmic", burstPowerX, burstY - 14, {
      align: "center", font: 'bold 10px "Inter", sans-serif', color: c.detected
    });
    drawText(ctx, "\u2717 Not rhythmic!", transientPowerX, transY - 14, {
      align: "center", font: 'bold 10px "Inter", sans-serif', color: c.transient
    });
    // Power axes
    ctx.strokeStyle = c.axes; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(margin.left, pwrTop);
    ctx.lineTo(margin.left, pwrTop + powerH);
    ctx.lineTo(margin.left + plotW, pwrTop + powerH);
    ctx.stroke();

    // Tick labels (closest to axis)
    for (var ts = 0; ts <= DURATION; ts += 0.5) {
      drawText(ctx, ts.toFixed(1), margin.left + (ts / DURATION) * plotW, pwrTop + powerH + 10, {
        align: "center", color: c.axesLabel, font: '9px "Inter", sans-serif'
      });
    }
    // Axis title
    drawText(ctx, "Time (s)", margin.left + plotW / 2, pwrTop + powerH + 22, {
      align: "center", color: c.axesLabel, font: '10px "Inter", sans-serif'
    });
    // Explanation text (below everything)
    drawText(ctx, "Both produce high power \u2014 wavelet alone can't tell the difference", margin.left + plotW / 2, pwrTop + powerH + 34, {
      align: "center", font: '9px "Inter", sans-serif', color: c.axesLabel
    });

    ctx.save();
    ctx.translate(14, pwrTop + powerH / 2); ctx.rotate(-Math.PI / 2);
    drawText(ctx, "Power", 0, 0, { align: "center", color: c.axesLabel, font: '10px "Inter", sans-serif' });
    ctx.restore();
  }

  // =====================================================================
  // STEP 3 RIGHT: Explanation text on canvas
  // =====================================================================

  function drawStep3Right(canvas) {
    var ctx = canvas.getContext("2d");
    var dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var W = canvas.width / dpr, H = canvas.height / dpr;
    var c = getCanvasColors();
    clearCanvas(ctx, W, H);

    drawText(ctx, "Why We Need Something Better", W / 2, 24, {
      font: 'bold 13px "Inter", sans-serif', align: "center"
    });

    var baseFont = '13px "Inter", sans-serif';
    var bulletFont = '12px "Inter", sans-serif';
    var lines = [
      { text: "A spectral peak does not guarantee", y: 58 },
      { text: "oscillatory activity.", y: 78 },
      { text: "", y: 98 },
      { text: "Non-rhythmic transients and artifacts", y: 110, color: c.transient || COLORS.transient },
      { text: "produce power at specific frequencies,", y: 132, color: c.transient || COLORS.transient },
      { text: "just like real oscillations do.", y: 154, color: c.transient || COLORS.transient },
      { text: "", y: 174 },
      { text: "We need detection that checks:", y: 192 },
      { text: "\u2022  Is the power above the background", y: 218, font: bulletFont },
      { text: "    spectrum (colored noise, 1/f)?", y: 236, font: bulletFont },
      { text: "\u2022  Does it last for multiple cycles?", y: 260, font: bulletFont },
      { text: "", y: 280 },
      { text: "This is exactly what BOSC does.", y: 300, color: c.detected || COLORS.detected },
    ];

    for (var i = 0; i < lines.length; i++) {
      if (!lines[i].text) continue;
      drawText(ctx, lines[i].text, W / 2, lines[i].y, {
        align: "center",
        font: lines[i].font || baseFont,
        color: lines[i].color || c.axesLabel,
      });
    }
  }

  // =====================================================================
  // WAVELET ANIMATION LOOP
  // =====================================================================

  function startWaveletAnimation() {
    if (waveletAnimState.running) return;
    waveletAnimState.running = true;
    waveletAnimState.position = 0;
    var startTime = null;
    var animDuration = 6000; // 6 seconds for full sweep

    function tick(timestamp) {
      if (!waveletAnimState.running) return;
      if (!startTime) startTime = timestamp;
      var elapsed = timestamp - startTime;
      waveletAnimState.position = Math.min(1, elapsed / animDuration);

      render();

      if (waveletAnimState.position < 1) {
        waveletAnimState.animId = requestAnimationFrame(tick);
      } else {
        waveletAnimState.running = false;
      }
    }

    waveletAnimState.animId = requestAnimationFrame(tick);
  }

  function stopWaveletAnimation() {
    waveletAnimState.running = false;
    if (waveletAnimState.animId) {
      cancelAnimationFrame(waveletAnimState.animId);
      waveletAnimState.animId = null;
    }
  }

  function resetWaveletAnimation() {
    stopWaveletAnimation();
    waveletAnimState.position = 0;
  }

  // =====================================================================
  // UI STATE & MANAGEMENT
  // =====================================================================

  var state = {
    step: 0, // 0 = start, 1-3 = steps
  };

  var STEP_INFO = [
    "",
    // Step 1
    '<strong>Step 1: The Fourier Transform</strong> decomposes any signal into a sum of sine waves at different frequencies. Notice how each test sine wave spans the <em>entire</em> signal \u2014 the DFT tells us <em>what</em> frequencies are present, but not <em>when</em> they occur. All timing information is lost. Press <strong>Replay</strong> to watch again.',
    // Step 2
    '<strong>Step 2: The Wavelet Transform</strong> slides a localized oscillation (wavelet) across the signal, measuring how well it matches at each time and frequency. This produces a time-frequency map showing <em>when</em> each frequency is strong. Press <strong>Replay</strong> to see the wavelet sweep again.',
    // Step 3
    '<strong>Step 3: The Limitation.</strong> Even with wavelets, a spectral peak at a given frequency does not necessarily mean there is a true oscillation. Non-rhythmic transients and large-amplitude artifacts also produce high power. We need a method that checks power <em>and</em> duration \u2014 that\u2019s BOSC.',
  ];

  function getEl(id) {
    return document.getElementById(id);
  }

  function initDemo() {
    var container = getEl("osc-container");
    if (!container) return;

    // Images no longer needed — animations are used instead

    // Wire step buttons
    var stepBtns = container.querySelectorAll(".osc-step-btn");
    stepBtns.forEach(function (btn) {
      btn.addEventListener("click", function () {
        goToStep(parseInt(this.dataset.step));
      });
    });

    // Start button
    var startBtn = getEl("osc-start-btn");
    if (startBtn) {
      startBtn.addEventListener("click", function () { goToStep(1); });
    }

    // Replay button
    var replayBtn = getEl("osc-replay-btn");
    if (replayBtn) {
      replayBtn.addEventListener("click", function () {
        if (state.step === 1) {
          resetFourierAnimation();
          startFourierAnimation();
        } else if (state.step === 2) {
          resetWaveletAnimation();
          startWaveletAnimation();
        }
      });
    }

    // BOSC link — scroll to and start the BOSC demo
    var boscLink = getEl("osc-bosc-link");
    if (boscLink) {
      boscLink.addEventListener("click", function (e) {
        e.preventDefault();
        var boscContainer = getEl("bosc-container");
        if (boscContainer) {
          boscContainer.scrollIntoView({ behavior: "smooth", block: "center" });
          // Click the BOSC start button after scrolling
          setTimeout(function () {
            var boscStart = getEl("bosc-start-btn");
            if (boscStart) boscStart.click();
          }, 600);
        }
      });
    }

    // Resize
    resizeCanvases();
    window.addEventListener("resize", function () {
      resizeCanvases();
      render();
    });

    // Theme changes
    var observer = new MutationObserver(function () { render(); });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    render();
  }

  function resizeCanvases() {
    var container = getEl("osc-container");
    if (!container) return;
    var styles = window.getComputedStyle(container);
    var paddingLeft = parseFloat(styles.paddingLeft) || 0;
    var paddingRight = parseFloat(styles.paddingRight) || 0;
    var containerW = Math.max(0, container.clientWidth - paddingLeft - paddingRight);
    var dpr = window.devicePixelRatio || 1;

    var mainCanvas = getEl("osc-canvas-main");
    var rightCanvas = getEl("osc-canvas-right");

    if (mainCanvas) {
      var displayW = Math.max(0, containerW - 10);
      var displayH = 420;
      mainCanvas.style.width = displayW + "px";
      mainCanvas.style.height = displayH + "px";
      mainCanvas.width = displayW * dpr;
      mainCanvas.height = displayH * dpr;
      mainCanvas.getContext("2d").setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    if (rightCanvas) {
      var halfW = Math.floor((containerW - 10 - 14) / 2);
      // Actually make main and right side-by-side on wide screens
      // But this demo uses main as full-width, right as full-width below
      // Let's follow the pattern of the other demos with two bottom canvases
    }
  }

  function goToStep(step) {
    state.step = step;

    // Stop animations when leaving their step
    if (step !== 1) {
      stopFourierAnimation();
      fourierAnimState.position = 1;
    }
    if (step !== 2) {
      stopWaveletAnimation();
      waveletAnimState.position = 1;
    }

    // Update buttons
    var btns = document.querySelectorAll(".osc-step-btn");
    btns.forEach(function (btn) {
      var s = parseInt(btn.dataset.step);
      btn.classList.toggle("active", s === step);
    });

    // Show/hide
    var container = getEl("osc-container");
    var startScreen = getEl("osc-start-screen");
    var vizArea = getEl("osc-viz-area");
    var controlsArea = getEl("osc-controls-area");
    if (container) container.classList.toggle("osc-active", step >= 1);
    if (startScreen) startScreen.style.display = step === 0 ? "flex" : "none";
    if (vizArea) vizArea.style.display = step >= 1 ? "block" : "none";
    if (controlsArea) controlsArea.style.display = step >= 1 ? "flex" : "none";

    // Show replay button on step 1 or 2
    var replayBtn = getEl("osc-replay-btn");
    if (replayBtn) replayBtn.style.display = (step === 1 || step === 2) ? "inline-block" : "none";

    // Show BOSC link only on step 3
    var boscLink = getEl("osc-bosc-link");
    if (boscLink) boscLink.style.display = step === 3 ? "inline-block" : "none";

    // Info text
    var infoEl = getEl("osc-info-text");
    if (infoEl && STEP_INFO[step]) {
      infoEl.innerHTML = STEP_INFO[step];
      infoEl.style.display = step >= 1 ? "block" : "none";
    }

    resizeCanvasesForStep(step);

    // Start animations
    if (step === 1) {
      generateStep1Data();
      resetFourierAnimation();
      setTimeout(function () { startFourierAnimation(); }, 100);
    } else if (step === 2) {
      generateStep2Data();
      resetWaveletAnimation();
      setTimeout(function () { startWaveletAnimation(); }, 100);
    }

    render();
  }

  function resizeCanvasesForStep(step) {
    var container = getEl("osc-container");
    if (!container) return;
    var styles = window.getComputedStyle(container);
    var paddingLeft = parseFloat(styles.paddingLeft) || 0;
    var paddingRight = parseFloat(styles.paddingRight) || 0;
    var containerW = Math.max(0, container.clientWidth - paddingLeft - paddingRight);
    var dpr = window.devicePixelRatio || 1;

    var mainCanvas = getEl("osc-canvas-main");
    var rightCanvas = getEl("osc-canvas-right");
    var bottomRow = getEl("osc-bottom-row");

    if (step === 1) {
      // Step 1: full-width image only
      if (bottomRow) bottomRow.style.display = "flex";
      var fullW = Math.max(0, containerW - 10);
      if (mainCanvas) {
        mainCanvas.style.width = fullW + "px";
        mainCanvas.style.height = "420px";
        mainCanvas.width = fullW * dpr;
        mainCanvas.height = 420 * dpr;
      }
      if (rightCanvas) {
        rightCanvas.style.width = "0px";
        rightCanvas.style.height = "0px";
        rightCanvas.style.display = "none";
      }
    } else if (step === 2) {
      // Step 2: full-width wavelet animation only
      if (bottomRow) bottomRow.style.display = "flex";
      fullW = Math.max(0, containerW - 10);
      if (mainCanvas) {
        mainCanvas.style.width = fullW + "px";
        mainCanvas.style.height = "420px";
        mainCanvas.width = fullW * dpr;
        mainCanvas.height = 420 * dpr;
      }
      if (rightCanvas) {
        rightCanvas.style.width = "0px";
        rightCanvas.style.height = "0px";
        rightCanvas.style.display = "none";
      }
    } else if (step === 3) {
      // Step 3: main = power ≠ oscillation, right = explanation
      if (bottomRow) bottomRow.style.display = "flex";
      var availW = Math.floor((containerW - 10 - 14) / 2);
      var displayH = 420;
      if (mainCanvas) {
        mainCanvas.style.width = availW + "px";
        mainCanvas.style.height = displayH + "px";
        mainCanvas.width = availW * dpr;
        mainCanvas.height = displayH * dpr;
      }
      if (rightCanvas) {
        rightCanvas.style.display = "";
        rightCanvas.style.width = availW + "px";
        rightCanvas.style.height = displayH + "px";
        rightCanvas.width = availW * dpr;
        rightCanvas.height = displayH * dpr;
      }
    }
  }

  function render() {
    var mainCanvas = getEl("osc-canvas-main");
    var rightCanvas = getEl("osc-canvas-right");
    if (state.step < 1) return;

    if (state.step === 1 && mainCanvas) {
      drawStep1(mainCanvas);
    } else if (state.step === 2 && mainCanvas) {
      drawStep2(mainCanvas);
    } else if (state.step === 3 && mainCanvas) {
      drawStep3(mainCanvas);
      if (rightCanvas) drawStep3Right(rightCanvas);
    }
  }

  // =====================================================================
  // INITIALIZATION
  // =====================================================================

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initDemo);
  } else {
    initDemo();
  }
})();
