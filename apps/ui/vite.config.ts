import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
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
  const port = Number(env.VITE_UI_PORT ?? 5174);
  const devNetwork = viteDevServerNetwork(env);

  return {
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "src"),
      },
    },
    server: {
      ...devNetwork,
      port,
      strictPort: true,
    },
  };
});
