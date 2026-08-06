/**
 * Preset de Tailwind compartido — sistema de marca Arkiteq Data.
 *
 * Los colores se exponen como variables CSS (definidas en @arkiteq/ui/tokens.css)
 * para soportar modo claro/oscuro sin recompilar. Estética clara, fría y premium,
 * con matices oscuros profundos (ink) y acento verde-azulado de marca.
 *
 * @type {Partial<import("tailwindcss").Config>}
 */
module.exports = {
  darkMode: "class",
  theme: {
    container: {
      center: true,
      padding: { DEFAULT: "1.25rem", lg: "2rem" },
      screens: { "2xl": "1280px" },
    },
    extend: {
      colors: {
        brand: {
          50: "var(--brand-50)",
          500: "var(--brand-500)",
          600: "var(--brand-600)",
          DEFAULT: "var(--brand-500)",
        },
        accent: {
          50: "var(--accent-50)",
          100: "var(--accent-100)",
          200: "var(--accent-200)",
          300: "var(--accent-300)",
          400: "var(--accent-400)",
          500: "var(--accent-500)",
          600: "var(--accent-600)",
          700: "var(--accent-700)",
          800: "var(--accent-800)",
          DEFAULT: "var(--accent-500)",
        },
        ink: {
          800: "var(--ink-800)",
          900: "var(--ink-900)",
        },
        background: "var(--bg)",
        surface: {
          DEFAULT: "var(--surface)",
          2: "var(--surface-2)",
        },
        border: "var(--border)",
        input: "var(--border)",
        ring: "var(--ring)",
        heading: "var(--text-title)",
        foreground: "var(--text-body)",
        muted: {
          DEFAULT: "var(--surface-2)",
          foreground: "var(--text-secondary)",
        },
        success: "var(--success)",
        warning: "var(--warning)",
        danger: "var(--danger)",
      },
      fontFamily: {
        display: ["var(--font-display)", "ui-sans-serif", "system-ui", "sans-serif"],
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 4px)",
        sm: "calc(var(--radius) - 8px)",
        xl: "calc(var(--radius) + 4px)",
      },
      boxShadow: {
        xs: "0 1px 2px 0 rgb(22 37 43 / 0.04)",
        sm: "0 1px 3px 0 rgb(22 37 43 / 0.06), 0 1px 2px -1px rgb(22 37 43 / 0.06)",
        md: "0 4px 16px -2px rgb(22 37 43 / 0.08), 0 2px 6px -2px rgb(22 37 43 / 0.05)",
        lg: "0 12px 32px -8px rgb(22 37 43 / 0.12), 0 4px 10px -4px rgb(22 37 43 / 0.06)",
        glow: "0 0 0 1px rgb(78 158 145 / 0.18), 0 8px 28px -8px rgb(78 158 145 / 0.32)",
      },
      fontSize: {
        "display-lg": [
          "clamp(2.75rem, 5vw + 1rem, 4.5rem)",
          { lineHeight: "1.04", letterSpacing: "-0.02em" },
        ],
        "display-md": [
          "clamp(2rem, 3vw + 1rem, 3rem)",
          { lineHeight: "1.08", letterSpacing: "-0.018em" },
        ],
      },
      keyframes: {
        "fade-up": {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "node-pulse": {
          "0%, 100%": { opacity: "0.35" },
          "50%": { opacity: "0.9" },
        },
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.5s cubic-bezier(0.16, 1, 0.3, 1) both",
        "node-pulse": "node-pulse 4s ease-in-out infinite",
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
