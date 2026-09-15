import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: `/${process.env.GITHUB_REPOSITORY?.split("/")[1] || "elections"}/`,
  plugins: [react()],
  build: {
    outDir: "dist-github",
    emptyOutDir: true,
  },
});
