# Liquid Glass Component Specifications

This reference provides the structural patterns and styling for the key components in the Liquid Glass design system.

---

## 1. Floating Navigation Dock (`.liquid-glass-nav`)

### Architecture
- **Container**: `fixed` at viewport bottom center (`bottom: 26px; left: 50%; transform: translateX(-50%)`).
- **Track**: Frosted glass pill with `backdrop-filter: blur(28px) saturate(190%)`.
- **Sliding Indicator**: Absolute positioned pill that smoothly slides behind the active item.
- **Items**: Flex row with icon + text + optional count badge.

### HTML/JSX Structure
```html
<nav class="liquid-glass-nav" aria-label="Main Navigation">
  <div class="liquid-nav-track">
    <!-- Sliding Liquid Highlight -->
    <div class="liquid-sliding-indicator" style="left: 7px; width: 95px;"></div>
    
    <button class="liquid-nav-item active">
      <span class="liquid-icon-wrap">
        <svg class="liquid-nav-svg" ...></svg>
      </span>
      <span class="liquid-nav-text">Home</span>
    </button>
    
    <button class="liquid-nav-item">
      <span class="liquid-icon-wrap">
        <svg class="liquid-nav-svg" ...></svg>
      </span>
      <span class="liquid-nav-text">Downloads</span>
      <span class="liquid-count-badge">3</span>
    </button>
  </div>
</nav>
```

---

## 2. Liquid Segmented Control (`.segmented-tab-capsule`)

Used for tabbed filtering (e.g. All / Complete / Failed):

### CSS Recipe
```css
.segmented-tab-capsule {
  position: relative;
  background: rgba(255, 255, 255, 0.76);
  backdrop-filter: blur(28px) saturate(190%);
  -webkit-backdrop-filter: blur(28px) saturate(190%);
  border-radius: 9999px;
  padding: 5px;
  display: flex;
  align-items: center;
  border: 1px solid rgba(255, 255, 255, 0.9);
  height: 56px;
  box-sizing: border-box;
  overflow: hidden;
}

.segmented-sliding-pill {
  position: absolute;
  top: 5px;
  bottom: 5px;
  border-radius: 9999px;
  background: linear-gradient(135deg, #7c4dfa 0%, #6830ea 100%);
  box-shadow: 0 8px 24px rgba(110, 53, 245, 0.42), inset 0 1.5px 2px rgba(255, 255, 255, 0.45);
  transition:
    left 0.38s cubic-bezier(0.34, 1.56, 0.64, 1),
    width 0.38s cubic-bezier(0.34, 1.56, 0.64, 1);
  pointer-events: none;
  z-index: 1;
}

.segment-btn {
  position: relative;
  z-index: 2;
  flex: 1;
  height: 100%;
  border-radius: 9999px;
  border: none;
  background: transparent !important;
  color: #64748b;
  font-family: var(--font-main);
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  transition: color 0.3s ease;
}

.segment-btn.active {
  color: #ffffff;
  font-weight: 600;
}
```

---

## 3. Concentric Squircle Card (`.download-item-card`)

A modern card layout featuring continuous superellipse curvature:

```css
.download-item-card {
  background: #ffffff;
  border-radius: 28px;
  padding: 6px;
  box-shadow: 0 4px 22px rgba(0, 0, 0, 0.04), 0 1px 3px rgba(0, 0, 0, 0.02);
  display: flex;
  align-items: center;
  gap: 12px;
}

.download-thumb-box {
  width: 72px;
  height: 72px;
  border-radius: 22px;
  overflow: hidden;
  flex-shrink: 0;
}
```

---

## 4. Centered Search Capsule (`.link-search-row`)

An uncluttered, centered input bar with circular action trigger:

```css
.link-search-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  max-width: 580px;
  margin: 0.5rem auto;
}

.link-input-capsule {
  flex: 1;
  background: #ffffff;
  border-radius: 9999px;
  padding: 0.75rem 1.25rem;
  display: flex;
  align-items: center;
  gap: 0.65rem;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.03);
}

.download-circle-submit-btn {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: var(--primary-gradient);
  color: #ffffff;
  border: none;
  cursor: pointer;
  box-shadow: 0 4px 16px rgba(110, 53, 245, 0.35);
  transition: transform 0.2s ease;
}

.download-circle-submit-btn:hover {
  transform: scale(1.05);
}
```
