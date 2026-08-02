# BetterTether Website Design Spec

## Overview

A single-page static HTML landing site for the BetterTether project, deployed via GitHub Pages from the `docs/` folder. Light, minimal, Apple-inspired aesthetic.

## Goals

- Educate visitors on what BetterTether is and how it works
- Drive downloads (DMG, one-liner install, build from source)
- Build trust through transparency (security, privacy, open-source)

## Tech Stack

- Single `index.html` with embedded CSS
- No JS frameworks — pure semantic HTML + CSS
- Inter font from Google Fonts CDN
- Responsive (mobile-first)
- Deployed from `docs/` folder on `main` branch via GitHub Pages

## Page Sections

### 1. Hero
- Headline: "Seamless Android Tethering for Mac"
- Subtitle: "No Kernel Extensions. No SIP Changes. No Reboots."
- Download button (primary, blue) + "View on GitHub" link (secondary)
- SVG illustration: USB-C cable connecting phone outline to laptop outline

### 2. Problem → Solution
- Three cards: HoRNDIS broken, tethering should work, BetterTether fixes it

### 3. How It Works
- Simplified data flow diagram (SVG): Phone → USB → Daemon → utun → Mac

### 4. Features Grid
- 2×2 grid: Zero System Changes, Apple Silicon Native, Samsung Friendly, Desktop GUI

### 5. Install Section
- DMG download button
- One-liner: `curl -sL ... | sudo bash`
- Build from source: `git clone` + `make app`
- Syntax-highlighted code blocks

### 6. macOS 15 Compatibility
- What works out-of-the-box
- MTU troubleshooting callout

### 7. Security & Privacy
- Zero telemetry, local logs only, 100% auditable

### 8. Footer
- GitHub link, MIT license, credits

## Visual Style

- White background
- Inter font family
- Primary blue: #0071E3 (Apple blue)
- Gray text: #1D1D1F (headings), #6E6E73 (body)
- Soft shadows, rounded corners (12px)
- Generous whitespace
- Max content width: 980px (Apple-style)

## Responsive Breakpoints

- Mobile: < 768px — single column, stacked cards
- Tablet: 768px–1024px — 2-column grids
- Desktop: > 1024px — full layout

## File Structure

```
docs/
├── index.html          (single-page site)
└── ...
```

## Assets

- SVG icons inline in HTML (no external image files needed)
- Phone/laptop hero illustration as inline SVG
- Data flow diagram as inline SVG
