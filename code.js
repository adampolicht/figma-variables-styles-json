figma.showUI(__html__, { width: 540, height: 660, title: 'Token Exporter' });

// ── Color helpers ────────────────────────────────────────────────────────────

function toHex(v) {
  return Math.round(v * 255).toString(16).padStart(2, '0');
}

function colorToHex({ r, g, b }) {
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function colorToRgba({ r, g, b }, a) {
  return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${+a.toFixed(2)})`;
}

function serializeColor(color, opacity) {
  const a = opacity ?? color.a ?? 1;
  return a < 1 ? colorToRgba(color, a) : colorToHex(color);
}

// ── Typography helpers ───────────────────────────────────────────────────────

function lineHeightToCss(lh) {
  if (lh.unit === 'AUTO') return 'normal';
  if (lh.unit === 'PIXELS') return `${lh.value}px`;
  if (lh.unit === 'PERCENT') return `${+(lh.value / 100).toFixed(4)}`;
  return 'normal';
}

function letterSpacingToCss(ls) {
  if (!ls || ls.value === 0) return '0';
  if (ls.unit === 'PIXELS') return `${ls.value}px`;
  if (ls.unit === 'PERCENT') return `${+(ls.value / 100).toFixed(4)}em`;
  return '0';
}

function fontStyleToWeight(style) {
  const s = style.toLowerCase();
  if (s.includes('thin')) return 100;
  if (s.includes('extralight') || s.includes('extra light')) return 200;
  if (s.includes('light')) return 300;
  if (s.includes('medium')) return 500;
  if (s.includes('semibold') || s.includes('semi bold') || s.includes('demi')) return 600;
  if (s.includes('extrabold') || s.includes('extra bold')) return 800;
  if (s.includes('black') || s.includes('heavy')) return 900;
  if (s.includes('bold')) return 700;
  return 400;
}

function textCaseToCss(tc) {
  return { UPPER: 'uppercase', LOWER: 'lowercase', TITLE: 'capitalize' }[tc] ?? 'none';
}

function textDecorationToCss(td) {
  return { UNDERLINE: 'underline', STRIKETHROUGH: 'line-through' }[td] ?? 'none';
}

// ── Variable unit inference ──────────────────────────────────────────────────

const PX_SCOPES = new Set([
  'CORNER_RADIUS', 'WIDTH_HEIGHT', 'GAP', 'FONT_SIZE',
  'PARAGRAPH_SPACING', 'PARAGRAPH_INDENT', 'STROKE_FLOAT', 'EFFECT_FLOAT',
]);
const EM_SCOPES = new Set(['LETTER_SPACING']);

function inferUnit(scopes) {
  if (!scopes || scopes.length === 0 || scopes.includes('ALL_SCOPES')) return null;
  if (scopes.some(s => PX_SCOPES.has(s))) return 'px';
  if (scopes.some(s => EM_SCOPES.has(s))) return 'em';
  return null;
}

// ── Main export ──────────────────────────────────────────────────────────────

figma.ui.onmessage = async (msg) => {
  if (msg.type !== 'export') return;

  try {
    const result = {
      meta: {
        exportedAt: new Date().toISOString(),
        fileName: figma.root.name,
      },
      variables: {},
      paintStyles: {},
      textStyles: {},
      effectStyles: {},
    };

    // ── Variables ────────────────────────────────────────────────────────────

    const collections = await figma.variables.getLocalVariableCollectionsAsync();
    const allVars     = await figma.variables.getLocalVariablesAsync();

    for (const col of collections) {
      const entry = { modes: col.modes.map(m => m.name) };
      const colVars = allVars.filter(v => v.variableCollectionId === col.id);

      for (const mode of col.modes) {
        const tokens = {};

        for (const v of colVars) {
          const raw = v.valuesByMode[mode.modeId];
          let value;

          if (raw && typeof raw === 'object' && raw.type === 'VARIABLE_ALIAS') {
            const ref = allVars.find(x => x.id === raw.id);
            value = ref ? `{${ref.name}}` : null;
          } else if (v.resolvedType === 'COLOR' && raw) {
            value = serializeColor(raw, raw.a);
          } else {
            value = raw ?? null;
          }

          tokens[v.name] = {
            type: v.resolvedType.toLowerCase(),
            value,
            ...(v.resolvedType === 'FLOAT' ? { unit: inferUnit(v.scopes) } : {}),
            ...(v.description ? { description: v.description } : {}),
          };
        }

        entry[mode.name] = tokens;
      }

      result.variables[col.name] = entry;
    }

    // ── Paint styles ─────────────────────────────────────────────────────────

    const paintStyles = await figma.getLocalPaintStylesAsync();
    for (const s of paintStyles) {
      const paint = s.paints.find(p => p.visible !== false);
      if (!paint) continue;

      if (paint.type === 'SOLID') {
        result.paintStyles[s.name] = {
          value: serializeColor(paint.color, paint.opacity ?? 1),
          ...(s.description ? { description: s.description } : {}),
        };
      } else {
        result.paintStyles[s.name] = {
          type: paint.type.toLowerCase().replace('_', '-'),
          ...(s.description ? { description: s.description } : {}),
        };
      }
    }

    // ── Text styles ──────────────────────────────────────────────────────────

    const textStyles = await figma.getLocalTextStylesAsync();
    for (const s of textStyles) {
      result.textStyles[s.name] = {
        fontFamily:     s.fontName.family,
        fontStyle:      s.fontName.style,
        fontWeight:     fontStyleToWeight(s.fontName.style),
        fontSize:       s.fontSize,
        lineHeight:     lineHeightToCss(s.lineHeight),
        letterSpacing:  letterSpacingToCss(s.letterSpacing),
        textTransform:  textCaseToCss(s.textCase),
        textDecoration: textDecorationToCss(s.textDecoration),
        ...(s.description ? { description: s.description } : {}),
      };
    }

    // ── Effect styles ────────────────────────────────────────────────────────

    const effectStyles = await figma.getLocalEffectStylesAsync();
    for (const s of effectStyles) {
      const shadows = s.effects
        .filter(e => e.visible !== false && (e.type === 'DROP_SHADOW' || e.type === 'INNER_SHADOW'))
        .map(e => {
          const inset = e.type === 'INNER_SHADOW' ? 'inset ' : '';
          return `${inset}${e.offset.x}px ${e.offset.y}px ${e.radius}px ${e.spread ?? 0}px ${colorToRgba(e.color, e.color.a)}`;
        });

      if (shadows.length === 0) continue;

      result.effectStyles[s.name] = {
        boxShadow: shadows.join(', '),
        ...(s.description ? { description: s.description } : {}),
      };
    }

    figma.ui.postMessage({ type: 'result', data: result });
  } catch (err) {
    figma.ui.postMessage({ type: 'error', message: err.message });
  }
};
