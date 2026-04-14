/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ABTEST_API_URL?: string;
  readonly VITE_UI_PORT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
