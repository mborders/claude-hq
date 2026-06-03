import type { Config } from 'tailwindcss';

/**
 * Warm Clay design system. Colors are defined as space-separated RGB channels
 * in styles/theme.css (light) / .dark, and referenced here via
 * `rgb(var(--x) / <alpha-value>)` so opacity modifiers (e.g. `bg-clay/30`) work.
 */
const channel = (name: string) => `rgb(var(${name}) / <alpha-value>)`;

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: channel('--bg'),
        'bg-subtle': channel('--bg-subtle'),
        surface: channel('--surface'),
        'surface-2': channel('--surface-2'),
        border: channel('--border'),
        'border-strong': channel('--border-strong'),
        ink: {
          DEFAULT: channel('--ink'),
          muted: channel('--ink-muted'),
          subtle: channel('--ink-subtle'),
        },
        clay: {
          DEFAULT: channel('--clay'),
          hover: channel('--clay-hover'),
          active: channel('--clay-active'),
          soft: channel('--clay-soft'),
          ring: channel('--clay-ring'),
        },
        success: { DEFAULT: channel('--success'), soft: channel('--success-soft') },
        warning: { DEFAULT: channel('--warning'), soft: channel('--warning-soft') },
        danger: { DEFAULT: channel('--danger'), soft: channel('--danger-soft') },
        info: channel('--info'),
        allow: channel('--success'),
        deny: channel('--danger'),
      },
      fontFamily: {
        sans: ['"Hanken Grotesk Variable"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono Variable"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      fontSize: {
        xs: ['0.75rem', { lineHeight: '1rem' }],
        sm: ['0.8125rem', { lineHeight: '1.25rem' }],
        base: ['0.875rem', { lineHeight: '1.4' }],
        md: ['1rem', { lineHeight: '1.5' }],
        lg: ['1.125rem', { lineHeight: '1.4' }],
        xl: ['1.375rem', { lineHeight: '1.25' }],
        '2xl': ['1.75rem', { lineHeight: '1.2' }],
      },
      borderRadius: {
        sm: '6px',
        md: '10px',
        lg: '14px',
        xl: '20px',
      },
      boxShadow: {
        sm: '0 1px 2px rgba(80, 60, 40, 0.06)',
        md: '0 4px 12px -2px rgba(80, 60, 40, 0.10)',
        lg: '0 12px 32px -6px rgba(70, 50, 35, 0.16)',
        focus: '0 0 0 2px rgb(var(--bg)), 0 0 0 4px rgb(var(--clay-ring))',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.96)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        'chip-in': {
          '0%': { opacity: '0', transform: 'scale(0.92)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 120ms ease-out',
        'slide-up': 'slide-up 180ms cubic-bezier(0.2, 0.8, 0.2, 1)',
        'scale-in': 'scale-in 140ms cubic-bezier(0.2, 0.8, 0.2, 1)',
        'chip-in': 'chip-in 120ms ease-out',
      },
    },
  },
  plugins: [],
} satisfies Config;
