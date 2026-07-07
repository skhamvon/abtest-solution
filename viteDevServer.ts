/** Options réseau communes des dev servers Vite (Docker / hostname). */
export function viteDevServerNetwork(env: Record<string, string>): {
  host: boolean;
  allowedHosts: true | string[];
} {
  const raw = env.VITE_DEV_ALLOWED_HOSTS?.trim();
  const allowedHosts =
    !raw || raw === "*"
      ? true
      : raw.split(",").map((h) => h.trim()).filter(Boolean);
  return {
    host: env.VITE_DEV_BIND_ALL !== "false",
    allowedHosts,
  };
}
