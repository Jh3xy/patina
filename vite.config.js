

import { defineConfig } from "vite";
import { resolve } from "path";

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
        collections: resolve(__dirname, "src/collections/index.html"), 
        books: resolve(__dirname, "src/books/index.html"), 
        catalog: resolve(__dirname, "src/catalog/index.html"), 
      },
    },
  },
});
