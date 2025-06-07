/** @type {import('tailwindcss').Config} */
const {fontFamily} = require("tailwindcss/defaultTheme")

export default {
  darkMode: ["variant", [".dark &", '[data-kb-theme="dark"] &']],
  content: ["./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px"
      }
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))"
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))"
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))"
        },
        info: {
          DEFAULT: "hsl(var(--info))",
          foreground: "hsl(var(--info-foreground))"
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))"
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))"
        },
        error: {
          DEFAULT: "hsl(var(--error))",
          foreground: "hsl(var(--error-foreground))"
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))"
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))"
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))"
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))"
        },
        sidebar: {
          DEFAULT: 'hsl(var(--sidebar-background))',
          foreground: 'hsl(var(--sidebar-foreground))',
          primary: 'hsl(var(--sidebar-primary))',
          'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
          accent: 'hsl(var(--sidebar-accent))',
          'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
          border: 'hsl(var(--sidebar-border))',
          ring: 'hsl(var(--sidebar-ring))',
        },
        tier: {
          bg0: 'var(--bc-tier-color-0)',
          bg1: 'var(--bc-tier-color-1)',
          bg2: 'var(--bc-tier-color-2)',
          bg3: 'var(--bc-tier-color-3)',
          bg4: 'var(--bc-tier-color-4)',
          bg5: 'var(--bc-tier-color-5)',
          bg6: 'var(--bc-tier-color-6)',
          bg7: 'var(--bc-tier-color-7)',
          bg8: 'var(--bc-tier-color-8)',
          bg9: 'var(--bc-tier-color-9)',
          bg10: 'var(--bc-tier-color-10)',
        },
        rarity: {
          border0: 'var(--bc-rarity-color-0)',
          border1: 'var(--bc-rarity-color-1)',
          border2: 'var(--bc-rarity-color-2)',
          border3: 'var(--bc-rarity-color-3)',
          border4: 'var(--bc-rarity-color-4)',
          border5: 'var(--bc-rarity-color-5)',
          border6: 'var(--bc-rarity-color-6)',
        }
      },
      borderRadius: {
        xl: "calc(var(--radius) + 4px)",
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)"
      },
      keyframes: {
        "accordion-down": {
          from: {height: 0},
          to: {height: "var(--kb-accordion-content-height)"}
        },
        "accordion-up": {
          from: {height: "var(--kb-accordion-content-height)"},
          to: {height: 0}
        },
        "content-show": {
          from: {opacity: 0, transform: "scale(0.96)"},
          to: {opacity: 1, transform: "scale(1)"}
        },
        "content-hide": {
          from: {opacity: 1, transform: "scale(1)"},
          to: {opacity: 0, transform: "scale(0.96)"}
        },
        "caret-blink": {
          "0%,70%,100%": {opacity: "1"},
          "20%,50%": {opacity: "0"}
        }
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "content-show": "content-show 0.2s ease-out",
        "content-hide": "content-hide 0.2s ease-out",
        "caret-blink": "caret-blink 1.25s ease-out infinite"
      },
      fontFamily: {
        sans: ["Inter", ...fontFamily.sans]
      },
    }
  },
  plugins: [require("tailwindcss-animate")]
}
