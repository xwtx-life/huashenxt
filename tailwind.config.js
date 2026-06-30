/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Text"', '"SF Pro Display"', '"Helvetica Neue"', 'Helvetica', 'Arial', 'sans-serif'],
        mono: ['"SF Mono"', 'SFMono-Regular', 'Consolas', '"Liberation Mono"', 'Menlo', 'monospace'],
      },
      colors: {
        macBg: 'var(--mac-bg)',
        macSidebar: 'var(--mac-sidebar)',
        macBorder: 'var(--mac-border)',
        macBlue: '#007aff',
        macBlueHover: '#0062cc',
        macGreen: '#34c759',
        macRed: '#ff453a',
        macYellow: '#ff9f0a',
        macTextPrimary: 'var(--mac-text-primary)',
        macTextSecondary: 'var(--mac-text-secondary)',
        macCardBg: 'var(--mac-card-bg)',
        macInputBg: 'var(--mac-input-bg)',
        macConsoleBg: 'var(--mac-console-bg)',
        macConsoleLineBorder: 'var(--mac-console-line-border)',
        macItemBg: 'var(--mac-item-bg)',
      }
    },
  },
  plugins: [],
}
