import { defineConfig } from "vite";
import { theaterPwa } from "./scripts/pwa-build.js";

export default defineConfig({
  base: "./",
  server: { watch: { ignored: ["**/.audit/**", "**/public/media/*.mp4"] } },
  plugins: [theaterPwa()],
  build: {
    target: "es2022",
    sourcemap: true,
  },
});
