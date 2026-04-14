/** Aligné sur `apps/remote` : surcharger via `VITE_ABTEST_API_URL` au build. */
export const API_BASE =
  import.meta.env.VITE_ABTEST_API_URL ?? "http://localhost:5002";
