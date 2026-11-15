import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const server = process.env.API_URL ?? "http://localhost:8787";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "SchauFUCHS",
        short_name: "SchauFUCHS",
        description: "Rassegeflügelschauen verwalten und bewerten",
        lang: "de",
        theme_color: "#171B24",
        background_color: "#FFFFFF",
        display: "standalone",
        // id bleibt "/", damit schon installierte Apps dieselbe App bleiben.
        id: "/",
        // start.html leitet ein Preisrichter-Tablet direkt zur Bewertung weiter (siehe public/start.html).
        start_url: "/start.html",
        scope: "/",
        icons: [
          { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
          { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
        ],
      },
      workbox: {
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/trpc/, /^\/datei/, /^\/api/, /\.pdf$/],
        // Mit der Hilfe (public/hilfe: HTML, Bilder des Tablets), damit sie in der Halle auch ohne Netz geht. Die übrigen
        // Hilfebilder und die PDFs lädt der Browser bei Bedarf (zu groß für jedes Tablet).
        globPatterns: ["**/*.{js,css,html,svg,woff2}", "hilfe/bilder/tablet-*.jpg", "icon-192.png", "apple-touch-icon.png"],
        // Der PDF-Leser der Katalogvorschau (pdf.js, gut 1 MB) lädt nur auf der Seite „Katalog“, nicht auf jedes Tablet.
        // Ebenso die 3D-Ansicht des Hallenplans (three.js) und ihr glTF-Export: nur, wer sie öffnet.
        globIgnores: ["**/assets/pdf-*.js", "**/assets/pdf.worker*", "**/assets/hallenplan-3d-*.js", "**/assets/GLTFExporter-*.js"],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      "/trpc": server,
      "/datei": server,
      "/api": server,
      "^/s/[^/]+/katalog\\.pdf": server,
    },
  },
});
