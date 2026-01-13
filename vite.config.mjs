import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  base: "/reserva-sc/",
  build: {
    outDir: "dist",
    rollupOptions: {
      input: {
        main: resolve(process.cwd(), "index.html"),
        admin: resolve(process.cwd(), "admin.html")
      }
    }
  }
});
