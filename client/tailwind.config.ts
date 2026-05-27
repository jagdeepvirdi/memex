import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // ── Backgrounds ──────────────────────────────
        // Use bg-bg (or bg-bg-2) — avoids text-base conflict with fontSize.base
        bg: {
          DEFAULT: '#0D0D0D',
          2: '#131211',
        },
        // Surfaces — warm aged-dark palette (from design handoff)
        surface: {
          DEFAULT: '#17150F',
          2: '#1C1A14',
          // CLAUDE.md aliases (simpler surface references)
          light: '#161616',
          lighter: '#1E1E1E',
          card: '#1A1813',
          hover: '#221F18',
          inset: '#0A0908',
        },

        // ── Text — warm aged-paper palette ───────────
        ink: {
          DEFAULT: '#F2EAD8',
          soft: '#D6CCB7',
          muted: '#8C8472',
          faint: '#5A5446',
          // CLAUDE.md aliases
          primary: '#F5F5F5',
          dimmed: '#9CA3AF',
        },

        // ── Accent — warm amber ───────────────────────
        accent: {
          DEFAULT: '#F59E0B',
          soft: '#FCD34D',
          deep: '#B45309',
        },

        // ── Vault — slate teal ────────────────────────
        vault: {
          DEFAULT: '#5EEAD4',
          deep: '#0F766E',
        },

        // ── Type badge palette ────────────────────────
        rose: '#E8B4A0',
        sage: '#A8C5A0',
        lilac: '#BFB0E0',
        sky: '#9CC4E8',
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
        'amber-glow': '0 0 24px rgba(245, 158, 11, 0.18)',
        'vault-glow': '0 0 24px rgba(94, 234, 212, 0.14)',
        'card': '0 1px 3px rgba(0, 0, 0, 0.4), 0 4px 16px rgba(0, 0, 0, 0.2)',
      },

      borderColor: {
        line: 'rgba(245, 230, 200, 0.07)',
        'line-strong': 'rgba(245, 230, 200, 0.14)',
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
