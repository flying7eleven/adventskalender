import type { Config } from 'tailwindcss';
import plugin from 'tailwindcss/plugin';

const config: Config = {
    darkMode: ['class'],
    content: ['./src/**/*.{ts,tsx}', './index.html'],
    theme: {
        container: {
            center: true,
            padding: '2rem',
            screens: {
                '2xl': '1400px',
            },
        },
        extend: {
            colors: {
                border: 'var(--color-border)',
                input: 'var(--color-input)',
                ring: 'var(--color-ring)',
                background: 'var(--color-background)',
                foreground: 'var(--color-foreground)',
                primary: {
                    DEFAULT: 'var(--color-primary)',
                    foreground: 'var(--color-primary-foreground)',
                },
                secondary: {
                    DEFAULT: 'var(--color-secondary)',
                    foreground: 'var(--color-secondary-foreground)',
                },
                destructive: {
                    DEFAULT: 'var(--color-destructive)',
                    foreground: 'var(--color-destructive-foreground)',
                },
                muted: {
                    DEFAULT: 'var(--color-muted)',
                    foreground: 'var(--color-muted-foreground)',
                },
                accent: {
                    DEFAULT: 'var(--color-accent)',
                    foreground: 'var(--color-accent-foreground)',
                },
                popover: {
                    DEFAULT: 'var(--color-popover)',
                    foreground: 'var(--color-popover-foreground)',
                },
                card: {
                    DEFAULT: 'var(--color-card)',
                    foreground: 'var(--color-card-foreground)',
                },
                // Glass colors
                'glass-bg': 'var(--color-glass-bg)',
                'glass-bg-strong': 'var(--color-glass-bg-strong)',
                'glass-border': 'var(--color-glass-border)',
                'glass-border-strong': 'var(--color-glass-border-strong)',
            },
            borderRadius: {
                lg: 'var(--radius)',
                md: 'calc(var(--radius) - 2px)',
                sm: 'calc(var(--radius) - 4px)',
            },
            backdropBlur: {
                xs: '2px',
                sm: '6px',
                md: '10px',
                DEFAULT: '12px',
                lg: '15px',
                xl: '20px',
            },
            fontSize: {
                xs: ['0.75rem', { lineHeight: '1rem' }],
                sm: ['0.875rem', { lineHeight: '1.25rem' }],
                base: ['1rem', { lineHeight: '1.5rem' }],
                lg: ['1.125rem', { lineHeight: '1.75rem' }],
                xl: ['1.25rem', { lineHeight: '1.75rem' }],
                '2xl': ['1.5rem', { lineHeight: '2rem' }],
                '3xl': ['1.875rem', { lineHeight: '2.25rem' }],
                '4xl': ['2.25rem', { lineHeight: '2.5rem' }],
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
            },
            animation: {
                'accordion-down': 'accordion-down 0.2s ease-out',
                'accordion-up': 'accordion-up 0.2s ease-out',
            },
            backgroundImage: {
                'gradient-glass-light': 'linear-gradient(135deg, var(--gradient-start), var(--gradient-mid), var(--gradient-end))',
                'gradient-glass-dark': 'linear-gradient(135deg, var(--gradient-start), var(--gradient-mid), var(--gradient-end))',
            },
        },
    },
    plugins: [
        require('tailwindcss-animate'),
        // Custom plugin for glass gradient utilities
        plugin(function ({ addUtilities, theme }) {
            addUtilities({
                '.bg-gradient-glass': {
                    'background-image': theme('backgroundImage.gradient-glass-light'),
                },
                '.dark .bg-gradient-glass': {
                    'background-image': theme('backgroundImage.gradient-glass-dark'),
                },
            });
        }),
    ],
};

export default config;
