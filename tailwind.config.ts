import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./components/**/*.{js,ts,jsx,tsx,mdx}', './app/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      fontSize: {
        screen: 'clamp(0.4673125rem, 1.10546875vw, 1rem)',
        'screen-sm': 'clamp(0.65625rem, 3.92vw, 1.91875rem)',
      },
      screens: {
        '2xl': '1440px',
      },
    },
  },
  corePlugins: {
    aspectRatio: false,
  },
  plugins: [require('@tailwindcss/aspect-ratio'), require('tailwindcss-animate')],
};

export default config;
