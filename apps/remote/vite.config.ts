import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { federation } from "@module-federation/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { viteDevServerNetwork } from "../../viteDevServer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const monorepoRoot = path.resolve(__dirname, "../..");

export default defineConfig(({ mode }) => {
  const env = {
    ...loadEnv(mode, monorepoRoot, ""),
    ...loadEnv(mode, process.cwd(), ""),
  };
  const port = Number(env.VITE_REMOTE_PORT ?? 5001);
  const devNetwork = viteDevServerNetwork(env);

  return {
    plugins: [
      react(),
      federation({
        name: "abtest_remote",
        filename: "remoteEntry.js",
        exposes: {
          "./AbTestSlot": "./src/AbTestSlot.tsx",
          "./visitorId": "./src/visitorId.ts",
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
      ...devNetwork,
      port,
      strictPort: true,
      cors: true,
      headers: {
        "Access-Control-Allow-Origin": "*",
      },
    },
  };
});

