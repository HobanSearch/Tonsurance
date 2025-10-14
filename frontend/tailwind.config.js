/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Cream/Beige (Background colors - matched to Tonny's cream body)
        cream: {
          50: '#FEFDFB',
          100: '#FCF9F5',
          200: '#F7F3ED',  // Main cream bg - Tonny's body color
          300: '#EBE7E0',  // Darker panels
          400: '#D9D5CE',  // Borders/shadows
          500: '#C5C1BA',
          600: '#ABA79F',
          700: '#8E8A83',
          800: '#6D6963',
          900: '#4C4945',
        },
        // Rose Copper (Metallic Brand accent - matched to Tonny's accents)
        copper: {
          50: '#FDF6F4',
          100: '#FBEAE6',
          200: '#F7D5CC',
          300: '#F0B8A8',
          400: '#E59780',
          500: '#D87665',  // Main rose-copper - Tonny's accent color
          600: '#C66555',
          700: '#AD5447',
          800: '#8B4439',
          900: '#6A332C',
        },
        // Terminal colors - darker for better readability
        terminal: {
          green: '#00AA00',     // Darker phosphor green for readability
          greenBright: '#33FF33', // Bright green for accents
          amber: '#CC8800',     // Darker amber
          red: '#CC0000',       // Darker red
          blue: '#0088CC',      // Info (TON blue)
        },
        // Keep some grays for text
        text: {
          primary: '#2C2C2C',
          secondary: '#666666',
          tertiary: '#999999',
        }
      },
      fontFamily: {
        mono: ['IBM Plex Mono', 'Space Mono', 'Courier New', 'monospace'],
      },
    },
  },
  plugins: [],
}
