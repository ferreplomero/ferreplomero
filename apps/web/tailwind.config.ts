import type { Config } from "tailwindcss";
import preset from "@arkiteq/config/tailwind-preset";

const config: Config = {
  presets: [preset as Partial<Config>],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
    // Componentes del design system (clases usadas en @arkiteq/ui)
    "../../packages/ui/src/**/*.{ts,tsx}",
  ],
};

export default config;
