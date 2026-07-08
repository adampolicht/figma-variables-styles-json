# Variables & Styles to JSON — Figma Plugin

A free, open-source Figma plugin that exports **Variables** and **Styles** from your design file into developer-ready formats: JSON, CSS custom properties, and TypeScript constants.

No limits. No paywall. No account required.

---

## What it exports

| Source | Figma API |
|---|---|
| Variables (COLOR, FLOAT, STRING, BOOLEAN) | `figma.variables.*` |
| Paint Styles (solid colors, gradients) | `getLocalPaintStylesAsync` |
| Text Styles (typography) | `getLocalTextStylesAsync` |
| Effect Styles (shadows, blurs) | `getLocalEffectStylesAsync` |

Multi-mode variables (e.g. Light / Dark) are fully supported.

---

## Output formats

### JSON
Full structured export — variables grouped by collection and mode, styles as flat objects.

```json
{
  "meta": {
    "exportedAt": "2026-07-08T12:00:00.000Z",
    "fileName": "My Design System"
  },
  "variables": {
    "Colors": {
      "modes": ["Light", "Dark"],
      "Light": {
        "Primary/500": { "type": "color", "value": "#3B82F6" },
        "Spacing/SM":  { "type": "float", "value": 8, "unit": "px" }
      },
      "Dark": {
        "Primary/500": { "type": "color", "value": "#60A5FA" }
      }
    }
  },
  "paintStyles":  { "Brand/Blue": { "value": "#3B82F6" } },
  "textStyles":   { "Heading/H1": { "fontFamily": "Inter", "fontWeight": 700, "fontSize": 32, ... } },
  "effectStyles": { "Shadow/MD":  { "boxShadow": "0px 4px 8px 0px rgba(0,0,0,0.1)" } }
}
```

### CSS Custom Properties
Variables mapped to `:root`, additional modes to `[data-theme="..."]`. Text styles exported as CSS classes.

```css
:root {
  --primary-500: #3B82F6;
  --spacing-sm: 8px;
}

[data-theme="dark"] {
  --primary-500: #60A5FA;
}

.text-heading-h1 {
  font-family: 'Inter', sans-serif;
  font-weight: 700;
  font-size: 32px;
  line-height: 40px;
}
```

### TypeScript
Nested `as const` exports with full type inference, ready to import in React projects.

```ts
export const colors = {
  "Primary": { "500": "#3B82F6" }
} as const;

export const themes = {
  "Colors": {
    "Light": { "Primary": { "500": "#3B82F6" } },
    "Dark":  { "Primary": { "500": "#60A5FA" } },
  }
} as const;

export const typography = {
  "Heading/H1": { fontFamily: "Inter", fontWeight: 700, fontSize: 32, ... }
} as const;
```

---

## Installation

This plugin is not yet published to the Figma Community. Install it locally:

1. Download or clone this repository
2. Open **Figma desktop** (browser does not support local plugins)
3. Go to `Plugins → Development → Import plugin from manifest`
4. Select `manifest.json` from this folder
5. Run via `Plugins → Development → Variables & Styles to JSON`

---

## Project structure

```
├── manifest.json   # Plugin metadata
├── code.js         # Plugin logic — reads Figma API (runs in sandbox)
└── ui.html         # Plugin UI — generates CSS/TS, handles downloads
```

---

## Notes

- **Variable aliases** (one variable referencing another) are exported as `{Path/To/Variable}` strings to preserve the reference rather than resolving to a flat value.
- **FLOAT unit inference** is based on variable scopes: `WIDTH_HEIGHT`, `GAP`, `CORNER_RADIUS` etc. map to `px`; `LETTER_SPACING` maps to `em`; `OPACITY`, `FONT_WEIGHT` are unitless.
- Gradient and image paint styles are noted in JSON but not converted to CSS (not representable as a single value).

---

## License

MIT
