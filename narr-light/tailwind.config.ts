import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        /** 原型纸张 / 墨色 / 朱砂配色体系 */
        paper: {
          DEFAULT: "hsl(var(--paper))",
          2: "hsl(var(--paper-2))",
          3: "hsl(var(--paper-3))",
          light: "hsl(var(--paper-light))",
          lighter: "hsl(var(--paper-lighter))",
        },
        ink: "hsl(var(--ink))",
        char: "hsl(var(--char))",
        blood: {
          DEFAULT: "hsl(var(--blood))",
          bright: "hsl(var(--blood-bright))",
          soft: "hsl(var(--blood-soft))",
        },
        sepia: {
          DEFAULT: "hsl(var(--sepia))",
          soft: "hsl(var(--sepia-soft))",
        },
        gold: {
          DEFAULT: "hsl(var(--gold))",
          soft: "hsl(var(--gold-soft))",
        },
        noir: {
          bg: "hsl(var(--noir-bg))",
          "bg-2": "hsl(var(--noir-bg-2))",
          panel: "hsl(var(--noir-panel))",
          text: "hsl(var(--noir-text))",
          muted: "hsl(var(--noir-muted))",
          line: "hsl(var(--noir-line))",
        },
        ok: "hsl(var(--ok))",
        warn: "hsl(var(--warn))",
        err: "hsl(var(--err))",
        info: "hsl(var(--info))",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        sans: ["var(--font-noto-serif-sc)", "Noto Serif SC", "serif"],
        mono: ["var(--font-courier-prime)", "Courier Prime", "monospace"],
        seal: ["var(--font-zcool-xiaowei)", "ZCOOL XiaoWei", "serif"],
        brush: ["var(--font-ma-shan-zheng)", "Ma Shan Zheng", "cursive"],
        typewriter: ["var(--font-special-elite)", "Special Elite", "monospace"],
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
