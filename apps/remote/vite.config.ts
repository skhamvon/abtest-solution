import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { federation } from "@module-federation/vite";
import path from "node:path";

export default defineConfig({
  plugins: [
    react(),
    federation({
      name: "abtest_remote",
      filename: "remoteEntry.js",
      exposes: {
        "./AbTestSlot": "./src/AbTestSlot.tsx",
      },
      shared: {
        react: { singleton: true },
        "react-dom": { singleton: true },
      },
    }),
  ],
  build: {
    target: "chrome89",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  // On sert directement les fichiers d'expérience depuis abtest-campaigns-segments
  publicDir: path.resolve(__dirname, "../../abtest-campaigns-segments"),
  server: {
    port: 5001,
  },
});

