/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class', '[data-theme="dark"]'],
  content: [
    './apps/*/src/**/*.{js,ts,jsx,tsx}',
    './packages/*/src/**/*.{js,ts,jsx,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        // Oatmeal brand colors
        brand: {
          oat: '#E6B63E',
          sprout: '#2F7D32', 
          fresh: '#55A84A',
          sproutTint: '#A6D49F',
        },
        neutral: {
          oatHusk: '#F9F4E7',
          oatCream: '#FFFDF9', 
          field: '#1A1F1A',
        },
        sprout: {
          50: '#F0F7F0',
          100: '#DCEEDC', 
          200: '#B7DDB8',
          300: '#92CC95',
          400: '#6DBB71',
          500: '#55A84A', // fresh
          600: '#3E943A',
          700: '#2F7D32', // primary sprout
          800: '#256329',
          900: '#1C4A21'
        },
        // Utility colors
        info: '#3B82F6',
        warn: '#F59E0B', 
        error: '#EF4444',
        success: '#10B981',
        // Keep existing shadcn colors for compatibility
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))'
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))'
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))'
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))'
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))'
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))'
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))'
        }
      },
      borderRadius: {
        sm: '6px',
        md: '10px', 
        lg: '14px',
        xl: '20px',
        // Keep shadcn compatibility
        DEFAULT: 'var(--radius)',
      },
      boxShadow: {
        card: '0 1px 2px rgba(0,0,0,.06), 0 8px 24px rgba(0,0,0,.12)',
        pop: '0 12px 32px rgba(0,0,0,.18)'
      },
      keyframes: {
        'accordion-down': {
          from: { height: 0 },
          to: { height: 'var(--radix-accordion-content-height)' }
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: 0 }
        }
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out'
      }
    }
  },
  plugins: [require('tailwindcss-animate')]
};