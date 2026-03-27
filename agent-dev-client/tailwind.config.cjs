const path = require('path');

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  content: [
    path.resolve(__dirname, './src/app/**/*.{ts,tsx,html}'),
    path.resolve(__dirname, './src/terminal/**/*.{ts,tsx,html}'),
  ],
  safelist: [
    {
      pattern: /order-(1[0-2]|[1-9]|first|last|none)/,
    },
  ],
  prefix: '',
  theme: {
    fontFamily: {
      consolas: ['"Consolas"', '"Courier New"', 'monospace'],
      'source-sans-pro': [
        'Source Sans Pro',
        '-apple-system',
        'BlinkMacSystemFont',
        'Roboto',
        'Helvetica Neue',
        'Arial',
        'Noto Sans',
        'sans-serif',
      ],
      'plus-jakarta-sans': [
        '"Plus Jakarta Sans"',
        '-apple-system',
        'BlinkMacSystemFont',
        'Roboto',
        'Helvetica Neue',
        'Arial',
        'Noto Sans',
        'sans-serif',
      ],
    },
    container: {
      center: true,
      padding: '2rem',
      screens: {
        xl: '1200px',
        '2xl': '1400px',
      },
    },
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          hover: 'hsl(var(--accent-hover))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        link: {
          DEFAULT: 'hsl(var(--link))',
          hover: 'hsl(var(--link-hover))',
          visited: 'hsl(var(--link-visited))',
        },
        success: {
          DEFAULT: 'hsl(var(--success))',
          foreground: 'hsl(var(--success-foreground))',
        },
        glass: 'hsl(var(--glass))',
        terminal: {
          bg: 'hsl(var(--terminal-bg))',
          'bg-secondary': 'hsl(var(--terminal-bg-secondary))',
          border: 'hsl(var(--terminal-border))',
          text: 'hsl(var(--terminal-text))',
          muted: 'hsl(var(--terminal-muted))',
          success: 'hsl(var(--terminal-success))',
          error: 'hsl(var(--terminal-error))',
        },
      },
      fontSize: {
        'heading-4xl': ['var(--font-heading-4xl)', { lineHeight: 'var(--line-heading-4xl)' }],
        'heading-2xl': ['var(--font-heading-2xl)', { lineHeight: 'var(--line-heading-2xl)' }],
        'heading-xl': ['var(--font-heading-xl)', { lineHeight: 'var(--line-heading-xl)' }],
        'heading-lg': ['var(--font-heading-lg)', { lineHeight: 'var(--line-heading-lg)' }],
        'heading-md': ['var(--font-heading-md)', { lineHeight: 'var(--line-heading-md)' }],
        'heading-sm': ['var(--font-heading-sm)', { lineHeight: 'var(--line-heading-sm)' }],
        'body-lg': ['var(--font-body-lg)', { lineHeight: 'var(--line-body-lg)' }],
        'body-base': ['var(--font-body-base)', { lineHeight: 'var(--line-body-base)' }],
        'body-sm': ['var(--font-body-sm)', { lineHeight: 'var(--line-body-sm)' }],
        'body-xs': ['var(--font-body-xs)', { lineHeight: 'var(--line-body-xs)' }],
      },
      borderRadius: {
        input: 'var(--radius-input)',
        xl: 'var(--radius-xl)',
        lg: 'var(--radius)',
        md: 'var(--radius-md)',
        sm: 'var(--radius-sm)',
      },
      maxWidth: {
        'container-xs': 'var(--container-xs)',
        'container-sm': 'var(--container-sm)',
        'container-md': 'var(--container-md)',
        'container-lg': 'var(--container-lg)',
        'container-xl': 'var(--container-xl)',
        'container-2xl': 'var(--container-2xl)',
        'container-content': 'var(--container-content)',
        'container-form': 'var(--container-form)',
      },
      backgroundImage: {
        ['accent-gradient']: 'linear-gradient(89.98deg, #563CF3 0.02%, #00e0ff 99.98%)',
        ['gradient-pending']: 'linear-gradient(97.35deg, #E5E7EB -54.91%, #FCA5A5 1.44%, #93B3F5 102.12%)',
        ['gradient-recording']: 'linear-gradient(90deg, #F7DA9A 0%, #B5E57F 100%)',
        ['gradient-loading']: 'linear-gradient(97.07deg, #60a5fa 11.9%, #3b82f6 100%)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'top-to-bottom': {
          from: {
            top: '0',
          },
          to: {
            top: '100%',
          },
        },
        'denoise-blur': {
          '0%': {
            filter: 'blur(10px)',
            opacity: '0.3',
            transform: 'scale(1.015)',
          },
          '25%': {
            filter: 'blur(6px)',
            opacity: '0.5',
            transform: 'scale(1.01)',
          },
          '50%': {
            filter: 'blur(3px)',
            opacity: '0.7',
            transform: 'scale(1.005)',
          },
          '75%': {
            filter: 'blur(1.5px)',
            opacity: '0.85',
            transform: 'scale(1.0025)',
          },
          '100%': {
            filter: 'blur(0px)',
            opacity: '1',
            transform: 'scale(1)',
          },
        },
        shimmer: {
          '0%': {
            transform: 'translateX(-100%)',
            opacity: '0',
          },
          '50%': {
            opacity: '0.6',
          },
          '100%': {
            transform: 'translateX(100%)',
            opacity: '0',
          },
        },
        'shimmer-text': {
          '0%': {
            backgroundPosition: '200% 0',
          },
          '100%': {
            backgroundPosition: '-200% 0',
          },
        },
        'thinking-dots': {
          '0%, 100%': {
            opacity: '0',
          },
          '33%, 90%': {
            opacity: '1',
          },
        },
        slideDown: {
          from: { height: '0' },
          to: { height: 'var(--radix-collapsible-content-height)' },
        },
        slideUp: {
          from: { height: 'var(--radix-collapsible-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        fadeUp: 'fadeUp 0.3s ease-out forwards',
        'spin-gradient': 'spin 3.5s linear forwards infinite',
        'vertical-loader': 'top-to-bottom 5s ease-out forwards infinite',
        'denoise-blur': 'denoise-blur 1.2s cubic-bezier(0.4, 0, 0.2, 1) forwards',
        shimmer: 'shimmer 1.2s ease-out forwards',
        'shimmer-text': 'shimmer-text 2s ease-in-out forwards',
        'thinking-dots': 'thinking-dots 1.2s ease-in-out infinite',
        slideDown: 'slideDown 200ms ease-out',
        slideUp: 'slideUp 200ms ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate'), require('tailwind-scrollbar')],
};
