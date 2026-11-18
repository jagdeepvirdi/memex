import type { Config } from 'tailwindcss'

// `rgb(var(--c-x) / <alpha-value>)`: a theme variable that still accepts Tailwind's opacity modifiers
const v = (name: string) => `rgb(var(--c-${name}) / <alpha-value>)`
const shades = (name: string, levels: number[]) =>
  Object.fromEntries(levels.map(l => [l, `rgb(var(--${name}-${l}) / <alpha-value>)`]))

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Every colour comes from the CSS variables in index.css, so one palette swap restyles the whole app
        // (dark "Midnight" / light "Daylight"). `white` is the theme's overlay tint: light-on-dark in dark mode,
        // ink-on-light in light mode, so `bg-white/5` and `border-white/10` work in both.
        white: v('overlay'),

        // Backgrounds — use bg-bg (or bg-bg-2); avoids the text-base conflict with fontSize.base
        bg: { DEFAULT: v('bg'), 2: v('bg-2') },
        surface: {
          DEFAULT: v('surface'),
          2: v('surface-2'),
          light: v('surface-light'),
          lighter: v('surface-lighter'),
          card: v('surface-card'),
          hover: v('surface-hover'),
          inset: v('surface-inset'),
        },

        // Text
        ink: {
          DEFAULT: v('ink'),
          soft: v('ink-soft'),
          muted: v('ink-muted'),
          faint: v('ink-faint'),
          primary: v('ink-primary'),
          dimmed: v('ink-dimmed'),
        },

        // Accent — "Iris" (blue-violet)
        accent: { DEFAULT: v('accent'), soft: v('accent-soft'), deep: v('accent-deep') },

        // Vault — teal
        vault: { DEFAULT: v('vault'), deep: v('vault-deep') },

        // Type badge palette
        rose: v('rose'),
        sage: v('sage'),
        lilac: v('lilac'),
        // `sky` is both the badge colour (text-sky) and a palette: text-sky-400 etc. were used but never defined, so they
        // rendered unstyled before; the shades now exist and flip with the theme like the other semantic palettes.
        sky: { DEFAULT: v('sky'), ...shades('sky', [300, 400, 500]) },
        violet: shades('violet', [400]),

        // Semantic palettes (only the shades the app uses), deeper in light mode
        amber: shades('amber', [300, 400, 500]),
        green: shades('green', [300, 400, 500]),
        red: shades('red', [300, 400, 500, 600]),
        orange: shades('orange', [300, 400, 500]),
        yellow: shades('yellow', [300, 400, 500]),
        blue: shades('blue', [300, 400, 500]),
        teal: shades('teal', [400]),
        purple: shades('purple', [100, 300, 400, 500]),
        emerald: shades('emerald', [300, 400, 500]),
        gray: shades('gray', [300]),
      },

      fontFamily: {
        // Display / headings — as specified in CLAUDE.md
        display: ['"Playfair Display"', 'Georgia', 'serif'],
        // Body copy
        body: ['"DM Sans"', 'system-ui', 'sans-serif'],
        // Monospace — passwords, specs, code
        mono: ['"JetBrains Mono"', 'monospace'],
        // Override Tailwind default sans
        sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
      },

      fontSize: {
        // Design system base
        xs: ['10.5px', { lineHeight: '1.4', letterSpacing: '0.06em' }],
        sm: ['12px', { lineHeight: '1.5' }],
        base: ['14.5px', { lineHeight: '1.5' }],
        md: ['16px', { lineHeight: '1.5' }],
        lg: ['18px', { lineHeight: '1.4' }],
        xl: ['22px', { lineHeight: '1.3' }],
        '2xl': ['28px', { lineHeight: '1.2' }],
        '3xl': ['36px', { lineHeight: '1.15' }],
      },

      borderRadius: {
        card: '12px',
        input: '8px',
        badge: '999px',
        btn: '9px',
        sm: '7px',
      },

      boxShadow: {
        'amber-glow': 'var(--shadow-glow)', // name kept for existing classes; it is the accent glow now
        'accent-glow': 'var(--shadow-glow)',
        'vault-glow': '0 0 24px rgb(var(--c-vault) / 0.16)',
        'card': 'var(--shadow-card)',
      },

      borderColor: {
        line: 'rgb(var(--c-overlay) / 0.08)',
        'line-strong': 'rgb(var(--c-overlay) / 0.16)',
      },

      backdropBlur: {
        topbar: '16px',
      },

      keyframes: {
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        slideUp: {
          from: { transform: 'translateY(12px)', opacity: '0' },
          to: { transform: 'translateY(0)', opacity: '1' },
        },
        slideInRight: {
          from: { transform: 'translateX(40px)', opacity: '0' },
          to: { transform: 'translateX(0)', opacity: '1' },
        },
        pulse: {
          '0%, 100%': { opacity: '0.6' },
          '50%': { opacity: '1' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },

      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.22s cubic-bezier(0.2, 0.7, 0.2, 1)',
        'slide-in-right': 'slideInRight 0.24s cubic-bezier(0.2, 0.7, 0.2, 1)',
        'pulse-soft': 'pulse 2s ease-in-out infinite',
        'shimmer': 'shimmer 1.8s linear infinite',
      },
    },
  },
  plugins: [],
} satisfies Config
