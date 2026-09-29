/**
 * Monochrome theme.
 *
 * Every chromatic Tailwind family is remapped to one neutral grey ramp, so
 * `text-cyan-400`, `text-emerald-400` and `text-amber-400` all resolve to the
 * same value and no hue survives anywhere in the UI. Doing it here rather than
 * by rewriting ~2,700 utility classes means the override is total and cannot
 * drift as new components are added.
 *
 * Two deliberate exceptions, both because a flat ramp would break function:
 *
 *   1. `slate` keeps its own darker ramp. It is the chrome of the whole app
 *      (page, panels, borders) and the depth hierarchy between
 *      bg-slate-950 / 900 / 800 is what makes the layout readable.
 *   2. Per-well colours live in `src/lib/wellColors.js` and are intentionally
 *      NOT routed through here — 26 wells distinguished only by shade number
 *      would all render identical. They use explicit arbitrary-value greys.
 *
 * Fonts: Inter for prose, JetBrains Mono for every numerical readout. `display`
 * aliases to the sans stack. `mono` is a REAL monospace stack — it previously
 * aliased to sans, which silently made the ~280 `font-mono` usages in the tree
 * render as proportional text. A control-room UI needs depths, pressures and
 * coordinates to align in columns, so mono must not be a no-op here.
 *
 * Shadows: the `glow-*` and `glass` utilities were removed. Soft glow is what gave
 * the UI a marketing/SaaS cast. Containers now separate by 1px borders and by the
 * slate ramp — depth is tonal, not luminous.
 */

/** Single neutral ramp. Shade N is the same grey for every family. */
const grey = {
  50: '#fafafa',
  100: '#f0f0f0',
  200: '#dedede',
  300: '#c4c4c4',
  400: '#a3a3a3',
  500: '#7d7d7d',
  600: '#5a5a5a',
  700: '#424242',
  800: '#2b2b2b',
  900: '#191919',
  950: '#0a0a0a',
};

/** Chrome ramp: same idea, but tuned so panel-on-page separation survives. */
const slate = {
  ...grey,
  50: '#fbfbfb',
  850: '#131313',
  750: '#212121',
};

const SANS = ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'];

/**
 * Real monospace. The web font is loaded in index.html; everything after it is a
 * fallback so an offline or air-gapped rig still gets fixed-pitch numerals rather
 * than silently falling back to proportional text.
 */
const MONO = [
  'JetBrains Mono',
  'ui-monospace',
  'SFMono-Regular',
  'Consolas',
  'Menlo',
  'monospace',
];

/** Every family here is now greyscale. */
const CHROMATIC = [
  'cyan', 'teal', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia',
  'pink', 'rose', 'red', 'orange', 'amber', 'yellow', 'lime', 'green',
  'emerald', 'gray', 'zinc', 'neutral', 'stone',
];

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: SANS,
        display: SANS,
        mono: MONO,
      },
      colors: {
        slate,
        ...Object.fromEntries(CHROMATIC.map((family) => [family, grey])),

        // Was emerald/amber/rose/cyan/violet. Now tonal only — a hazard is
        // distinguished by its label and icon, not by hue.
        status: {
          active: grey[400],
          warning: grey[300],
          danger: grey[200],
          fluid: grey[400],
          stratigraphy: grey[500],
        },
      },
      spacing: {
        13: '3.25rem',
      },
      animation: {
        'spin-slow': 'spin 8s linear infinite',
        'pulse-subtle': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      }
    },
  },
  plugins: [require('@tailwindcss/typography')],
}
