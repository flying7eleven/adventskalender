import type { Config } from 'tailwindcss';

const config: Config = {
    content: ['./src/**/*.{ts,tsx}', './index.html'],
    plugins: [require('tailwindcss-animate')],
};

export default config;
