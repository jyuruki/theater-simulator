import { defineConfig } from "vite";
import { theaterPwa } from "./scripts/pwa-build.js";

export default defineConfig({
  base: "./",
  plugins: [theaterPwa()],
  build: {
    target: "es2022",
    sourcemap: true,
  },
});
