# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Static HTML/CSS/JavaScript website for the Computational Memory Lab (Dr. Jeremy B. Caplan, University of Alberta). Studies human verbal memory through mathematical modeling, cognitive psychology, and brain imaging (EEG/fMRI). Deployed via GitHub Pages from the `/docs` folder.

**Live site:** https://computational-memory-lab.github.io/cml-website/index.html

## Development

No build process. Serve locally with `python3 -m http.server` from `docs/`. All changes are direct file edits with browser refresh.

## Architecture

### Page Structure
All site pages live in `docs/` — `index.html`, `research.html`, `team.html`, `publications.html`, `courses.html`, `contact.html`, `resources.html`, `games.html`, `JBC.html`. Each page includes the shared nav header, theme toggle logic, and links `style.css` + `scroll-offset.js`.

### Interactive Demos
Six research demos are each a single self-contained JS file (IIFE pattern) loaded as `<script>` tags at the bottom of `research.html`. Their HTML containers and CSS are defined inline in `research.html`, not in the demo directories.

| Demo | File | Purpose |
|------|------|---------|
| Oscillation Detection | `docs/osc_detection_demo/osc_detection_demo.js` | Transition demo: Fourier vs Wavelet transforms, why power ≠ oscillation (3 steps with animations) |
| BOSC | `docs/bosc_demo/bosc_demo.js` | Better OSCillation detection — 5-step walkthrough with interactive sliders |
| ERP Memory | `docs/erp_memory_demo/erp_demo.js` | Event-Related Potentials and memory effects |
| Classifier | `docs/clf_demo/clf_demo.js` | EEG signal classification for memory prediction (6 steps) |
| EEG | `docs/eeg_demo/eeg_demo.js` | EEG signal visualization |
| Subsetting | `docs/subsetting_demo/subsetting_demo.js` | Subsetting methodology |

Demo ordering on the research page: EEG → Oscillation Detection → BOSC → ERP → Classifiers → Subsetting.

Each demo follows the same pattern:
- IIFE wrapping all code in `(function() { "use strict"; ... })();`
- A start screen with a button that reveals the visualization area
- Step-based navigation (`.{prefix}-step-btn` buttons) progressing through the concept
- Canvas-based rendering (no external charting library except Google Charts in Attention Tuner)
- Dark/light theme support via CSS classes and color constants
- `getCanvasColors()` function returns theme-appropriate color palette

### Oscillation Detection Demo (transition between EEG and BOSC)
Located in `docs/osc_detection_demo/`. Three animated steps:
1. **Fourier Transform**: Animated sweep of test sine waves across frequencies, building up the spectrum progressively
2. **Wavelet Transform**: Animated Morlet wavelet sliding across a signal with burst + transient, building a time-frequency map
3. **The Limitation**: Shows that both oscillations and transients produce high wavelet power — motivates BOSC

Both step 1 and 2 have "Replay Animation" buttons. Step 3 has a "Continue to BOSC Demo" link that scrolls to and auto-starts the BOSC demo.

### BOSC Demo
Located in `docs/bosc_demo/`. Five interactive steps:
1. **Signal**: Simulated EEG with 1/f colored noise. Two ground-truth regions are embedded and shaded on the main canvas:
   - `BURST1` (~1–3.5 s, green shading, "Embedded rhythmic activity"): a Hann-windowed sustained oscillation at the chosen frequency — a true rhythm.
   - `BURST2` (~5.65–6.35 s, peach shading, "Embedded non-rhythmic activity"): a single monophasic Gaussian transient spike (no sinusoidal modulation). High peak amplitude, broadband, ~150 ms FWHM — produces strong wavelet power but is far below BOSC's duration threshold.
   - Signal generation is split into `addSustainedBurst()` and `addTransientBursts()` helpers, used by both `generateSignal()` and `extractComponents()` so the step-3 decomposition matches exactly.
2. **Spectrum**: Power spectrum (log-log) on left canvas, spectrogram (time-frequency heatmap) on right canvas
3. **Background**: Spectrum with 1/f regression fit on left; "Why 1/f Background Matters" bar chart (without vs with background correction) on right; background-only trace overlay on main signal canvas (drawn as a faint, low-amplitude, circularly time-shifted copy of the oscillation-subtracted background, anchored at a fixed baseline so it reads as a subtle spectral reference across the whole 8 s rather than tracking the signal)
4. **Thresholds**: Spectrum with power threshold (P_T) on left; right canvas split into compact chi-square PDF (top) + three interactive duration threshold example panels A/B/C (bottom). Both threshold sliders (P_T percentile, D_T cycles) reactively update the visuals
5. **Detection / Pepisode**: Detected oscillations highlighted on main signal; right canvas shows two example EEG traces from a paired-associate recognition task — Remembered (Hit, PEPISODE=0.90, green) vs Forgotten (Miss, PEPISODE=0.09, red)

Key implementation details:
- `extractComponents(signal, params)` decomposes signal into background + oscillation for step 3 visual
- `generatePepSignal()` creates synthetic EEG traces with controlled detection proportions for step 5
- Pepisode traces are cached (`pepTraceCache`) — bump `PEP_CACHE_VER` to regenerate
- Power threshold visualization uses a compressed visual offset (`ptLogOffset`) that responds to the P_T slider
- Duration threshold examples dynamically adjust case cycles based on D_T slider value
- Main signal canvas legend is left-aligned but anchored so the longest label ends flush with the plot's right axis (keeps it clear of both shaded regions). Colors: green for rhythmic, peach (`burstRegionTransient`) for non-rhythmic — peach avoids conflict with the pink used for the 1/f background and the orange used for thresholds.

### Attention Tuner
Separate from the research demos — lives in `docs/attention_tuner/` with its own `index.html`, `script.js`, and `style.css`. Implements a cognitive memory recognition experiment with study/distractor/recognition phases. Uses Google Charts and localStorage for results.

### Games Hub
Four educational games in `docs/games/` — `brainwave_surfer/`, `erp_catcher/`, `memory_trace/`, `recall_rush/`. Share `game-shell.css` for UI styling and `leaderboard.js` for a global leaderboard system. Linked from `games.html`.

### Design System
- **Theme:** Dark-first with light mode toggle. Theme state in `localStorage`, applied before first paint via inline `<script>` in `<head>`.
- **Colors:** Primary blue `#7cb3f1`, accent `#5b8fd9`, neural green `#00d68f`, dark bg `#06080D`/`#1A1E29`. Demo canvases use their own color constants.
- **Fonts:** Playfair Display (headings), Inter (body) — loaded from Google Fonts.
- **CSS:** All in `docs/style.css` using custom properties. Demo-specific styles are inline `<style>` blocks in `research.html`.

### Key Conventions
- Demo JS files are large single files (50-85KB) — all logic, rendering, and math in one IIFE
- No npm, no bundler, no dependencies beyond Google Fonts and Google Charts (Attention Tuner only)
- Canvas rendering uses raw Canvas 2D API throughout
- Word lists loaded from `docs/words.txt` (used by Attention Tuner)
- Research papers served as PDFs from `docs/papers/`
- **BOSC capitalization**: always write the expansion as "Better OSCillation detection" (lowercase `d`), matching the published convention — applies on `index.html`, `research.html`, `resources.html`, and in `bosc_demo.js` headers. Cited paper titles in `publications.html` and the `papers/BOSC_scripts/` library files are left with their original casing.
- **Unit spacing**: user-facing unit labels take a space between number and unit (`"2 s"`, `"200 ms"`, `"7 Hz"`), applied in canvas axis labels across demos. CSS durations (`transition: 0.3s ease`) and SVG attributes (`dur="2s"`) keep their native syntax.
