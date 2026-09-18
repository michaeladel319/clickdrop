---
name: liquid-glass-ui
description: >-
  Use this skill when designing or implementing modern, premium liquid glassmorphism
  user interfaces, fluid sliding pill indicators with spring physics (cubic-bezier),
  superellipse squircle geometries, and clean modern typography (Plus Jakarta Sans).
  Includes complete CSS formulas, React indicator hooks, and production component templates.
---

# Liquid Glass UI & Fluid Design System

This skill provides the comprehensive design tokens, mathematics, animations, and component recipes for building **Liquid Glass** user interfaces.

It is based on the modern, high-end Apple / iOS 18 / visionOS aesthetic: translucent frosted glass with specular edge reflections, multi-layer depth elevation, and physical sliding liquid indicator pills.

---

## Core Aesthetic Pillars

### 1. Liquid Glass Recipe
Liquid glass is distinct from simple transparent backgrounds. It requires three synergistic layers:
1. **Optical Frosted Refraction**: High blur + color saturation boost
   ```css
   backdrop-filter: blur(28px) saturate(190%);
   -webkit-backdrop-filter: blur(28px) saturate(190%);
   background: rgba(255, 255, 255, 0.72);
   ```
2. **Specular Top Edge Reflection (Gloss Sheen)**: Simulates top directional light hitting glass thickness
   ```css
   border: 1px solid rgba(255, 255, 255, 0.88);
   ```
   with a linear top specular line:
   ```css
   &::before {
     content: '';
     position: absolute;
     top: 0;
     left: 12%;
     right: 12%;
     height: 1.5px;
     background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.95), transparent);
     pointer-events: none;
   }
   ```
3. **Multi-Layer Ambient & Elevation Shadows**:
   ```css
   box-shadow:
     0 18px 38px -8px rgba(110, 53, 245, 0.16),
     0 6px 18px -4px rgba(0, 0, 0, 0.07),
     inset 0 1px 2px rgba(255, 255, 255, 0.95),
     inset 0 -1px 2px rgba(0, 0, 0, 0.03);
   ```

---

### 2. Fluid Sliding Liquid Pill Animation
Instead of abruptly toggling background colors on tabs/buttons, a single **morphing liquid pill element** glides beneath the active item using spring physics.

- **The Spring Physics Curve**:
  ```css
  transition:
    left 0.4s cubic-bezier(0.34, 1.56, 0.64, 1),
    width 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
  ```
- **Text & Icon Crossfade**: The buttons sit at `z-index: 2` with `background: transparent !important`. Inactive buttons have `color: #64748b`, while active buttons smoothly transition to `color: #ffffff`.

---

### 3. Modern Minimalist Typography
Use **Plus Jakarta Sans** with optical letter-spacing:
- **Headings**: `font-family: 'Plus Jakarta Sans', sans-serif; font-weight: 700; letter-spacing: -0.025em;`
- **Subtitles & Descriptions**: `font-size: 13px; font-weight: 400; color: #6b7280; letter-spacing: -0.01em;`
- **Interactive Labels & Buttons**: `font-weight: 600; letter-spacing: -0.01em;`

---

### 4. Concentric Superellipse Squircle Geometry
Avoid harsh corner radiuses. Use concentric rounded squircles where inner elements follow the exact curve ratio of outer containers:
- Card radius: `28px` (`corner-shape: squircle`)
- Inner thumbnail: `18px - 20px` radius
- Capsule buttons & pills: `9999px`

---

## Detailed References & Code Recipes

Read these reference files when building specific components:

- [Design Tokens & CSS Formulas](./references/tokens.css): Full CSS variables, keyframe animations, glass values, and shadow elevations.
- [Component Specifications](./references/components.md): Blueprint for Floating Nav, Segmented Controls, Concentric Cards, and Action Bars.
- [Liquid Navigation Example](./examples/LiquidNav.tsx): Complete React component with dynamic tab ref measurement and smooth spring sliding.
- [Liquid Segmented Control Example](./examples/SegmentedControl.tsx): Reusable filter/segmented tabs component.
