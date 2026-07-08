figma.showUI(__html__, { width: 540, height: 660, title: 'Variables & Styles to JSON' });

// ── Color helpers ────────────────────────────────────────────────────────────

function toHex(v: number): string {
  return Math.round(v * 255).toString(16).padStart(2, '0');
}

function colorToHex({ r, g, b }: RGB): string {
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function colorToRgba({ r, g, b }: RGB, a: number): string {
  return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${+a.toFixed(2)})`;
}

function serializeColor(color: RGB, opacity: number): string {
  return opacity < 1 ? colorToRgba(color, opacity) : colorToHex(color);
}

// ── Typography helpers ───────────────────────────────────────────────────────

function lineHeightToCss(lh: LineHeight): string {
  if (lh.unit === 'AUTO') return 'normal';
  if (lh.unit === 'PIXELS') return `${lh.value}px`;
  if (lh.unit === 'PERCENT') return `${+(lh.value / 100).toFixed(4)}`;
  return 'normal';
}

function letterSpacingToCss(ls: LetterSpacing): string {
  if (!ls || ls.value === 0) return '0';
  if (ls.unit === 'PIXELS') return `${ls.value}px`;
  if (ls.unit === 'PERCENT') return `${+(ls.value / 100).toFixed(4)}em`;
  return '0';
}

function fontStyleToWeight(style: string): number {
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

function textCaseToCss(tc: TextCase): string {
  const map: Partial<Record<TextCase, string>> = {
    UPPER: 'uppercase',
    LOWER: 'lowercase',
    TITLE: 'capitalize',
  };
  return map[tc] ?? 'none';
}

function textDecorationToCss(td: TextDecoration): string {
  const map: Partial<Record<TextDecoration, string>> = {
    UNDERLINE: 'underline',
    STRIKETHROUGH: 'line-through',
  };
  return map[td] ?? 'none';
}

// ── Variable unit inference ──────────────────────────────────────────────────

const PX_SCOPES = new Set<VariableScope>([
  'CORNER_RADIUS', 'WIDTH_HEIGHT', 'GAP', 'FONT_SIZE',
  'PARAGRAPH_SPACING', 'PARAGRAPH_INDENT', 'STROKE_FLOAT', 'EFFECT_FLOAT',
]);

const EM_SCOPES = new Set<VariableScope>(['LETTER_SPACING']);

function inferUnit(scopes: VariableScope[]): string | null {
  if (!scopes.length || scopes.includes('ALL_SCOPES')) return null;
  if (scopes.some(s => PX_SCOPES.has(s))) return 'px';
  if (scopes.some(s => EM_SCOPES.has(s))) return 'em';
  return null;
}

// ── Types ────────────────────────────────────────────────────────────────────

type TokenValue = string | number | boolean | null;

interface Token {
  type: string;
  value: TokenValue;
  unit?: string | null;
  description?: string;
}

interface CollectionEntry {
  modes: string[];
  [mode: string]: string[] | Record<string, Token>;
}

interface ExportResult {
  meta: { exportedAt: string; fileName: string };
  variables: Record<string, CollectionEntry>;
  paintStyles: Record<string, { value?: string; type?: string; description?: string }>;
  textStyles: Record<string, Record<string, unknown>>;
  effectStyles: Record<string, { boxShadow: string; description?: string }>;
}

// ── Main export ──────────────────────────────────────────────────────────────

figma.ui.onmessage = async (msg: { type: string }) => {
  if (msg.type !== 'export') return;

  try {
    const result: ExportResult = {
      meta: {
        exportedAt: new Date().toISOString(),
        fileName: figma.root.name,
      },
      variables:    {},
      paintStyles:  {},
      textStyles:   {},
      effectStyles: {},
    };

    // ── Variables ────────────────────────────────────────────────────────────

    const collections = await figma.variables.getLocalVariableCollectionsAsync();
    const allVars     = await figma.variables.getLocalVariablesAsync();

    for (const col of collections) {
      const entry: CollectionEntry = { modes: col.modes.map(m => m.name) };
      const colVars = allVars.filter(v => v.variableCollectionId === col.id);

      for (const mode of col.modes) {
        const tokens: Record<string, Token> = {};

        for (const v of colVars) {
          const raw = v.valuesByMode[mode.modeId];
          let value: TokenValue = null;

          if (raw && typeof raw === 'object' && 'type' in raw && (raw as VariableAlias).type === 'VARIABLE_ALIAS') {
            const ref = allVars.find(x => x.id === (raw as VariableAlias).id);
            value = ref ? `{${ref.name}}` : null;
          } else if (v.resolvedType === 'COLOR' && raw) {
            const c = raw as RGBA;
            value = serializeColor(c, c.a ?? 1);
          } else {
            value = (raw as TokenValue) ?? null;
          }

          const token: Token = {
            type:  v.resolvedType.toLowerCase(),
            value,
          };

          if (v.resolvedType === 'FLOAT') {
            token.unit = inferUnit(v.scopes);
          }

          if (v.description) token.description = v.description;

          tokens[v.name] = token;
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
      const shadows = (s.effects as readonly Effect[])
        .filter(e => e.visible !== false && (e.type === 'DROP_SHADOW' || e.type === 'INNER_SHADOW'))
        .map(e => {
          const shadow = e as DropShadowEffect | InnerShadowEffect;
          const inset  = e.type === 'INNER_SHADOW' ? 'inset ' : '';
          return `${inset}${shadow.offset.x}px ${shadow.offset.y}px ${shadow.radius}px ${shadow.spread ?? 0}px ${colorToRgba(shadow.color, shadow.color.a)}`;
        });

      if (!shadows.length) continue;

      result.effectStyles[s.name] = {
        boxShadow: shadows.join(', '),
        ...(s.description ? { description: s.description } : {}),
      };
    }

    figma.ui.postMessage({ type: 'result', data: result });
  } catch (err) {
    figma.ui.postMessage({ type: 'error', message: (err as Error).message });
  }
};
