import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/postcss";
import { defineConfig } from "vite";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: "/Openhandle/",
  root: path.join(projectRoot, "pages"),
  publicDir: path.join(projectRoot, "public"),
  css: { postcss: { plugins: [tailwindcss()] } },
  plugins: [react()],
  resolve: {
    alias: {
      "@": projectRoot,
      "next/image": path.join(projectRoot, "pages/next-image.tsx"),
    },
  },
  build: {
    outDir: path.join(projectRoot, "pages-dist"),
    emptyOutDir: true,
  },
});
