import { defineConfig } from "vite";

export default defineConfig({
  server: {
    // This forces Vite to always use the IPv4 loopback address
    host: "127.0.0.1",
    port: 5173,
  },
  root: ".",
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        collections: resolve(__dirname, "/src/collections/index.html"),
      },
    },
  },
});
