# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is the Computational Memory Lab website, a static HTML/CSS/JavaScript website for Dr. Jeremy B. Caplan's research lab at the University of Alberta. The lab studies human verbal memory behavior through mathematical modeling, behavioral measures, and brain imaging techniques.

## Site Structure

- `docs/` - Main website directory containing all web assets
  - `index.html` - Homepage with lab overview and research description
  - `research.html`, `publications.html`, `courses.html`, `team.html`, `contact.html` - Main site pages
  - `style.css` - Global stylesheet with dark theme and theta wave background
  - `papers/` - PDF repository of lab publications
  - `images/` - Site images and graphics
  - `attention_tuner/` - Interactive cognitive experiment web app

## Key Components

### Attention Tuner Application
Located in `docs/attention_tuner/`, this is a JavaScript-based cognitive psychology experiment that demonstrates the "inverted list-strength effect":

- `index.html` - Main experiment interface with multiple phases
- `script.js` - Core experiment logic with study/distractor/recognition phases
- `style.css` - Experiment-specific styling

The app implements a memory recognition experiment with:
- Study phase with strong (2000ms) and weak (500ms) word presentations
- Distractor task (arithmetic problems)
- Recognition test with attention spotlight visualization
- Results analysis with Google Charts integration
- Local storage for result persistence

### Design System

The site uses a dark neuroscience-themed design with:
- CSS custom properties for consistent theming
- Theta wave SVG background pattern
- Inter font family for modern typography
- Neural-inspired color palette (blues and greens)

## Development Commands

Since this is a static website, development is straightforward:

- **Local development**: Open any `.html` file in a web browser
- **Testing**: Manual browser testing across different devices/browsers
- **File serving**: Use any static file server (e.g., `python -m http.server` in the `docs/` directory)

## File Organization

- HTML files use semantic structure with proper navigation
- CSS uses modern features like custom properties and flexbox
- JavaScript in the attention tuner uses vanilla DOM manipulation
- All assets are self-contained with no external dependencies (except Google Charts)

## Important Notes

- The attention tuner experiment stores results in localStorage
- SVG backgrounds are procedurally generated for the theta wave pattern
- Site is designed to be fully responsive across devices
- No build process required - direct file editing and browser refresh workflow