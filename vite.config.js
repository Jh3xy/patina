import { defineConfig } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Safely defines __dirname to ensure absolute compatibility on cloud platforms
const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
        main: path.resolve(__dirname, "index.html"),
        collections: path.resolve(__dirname, "src/collections/index.html"),
        books: path.resolve(__dirname, "src/books/index.html"),
        catalog: path.resolve(__dirname, "src/catalog/index.html"),
      },
    },
  },
});