/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  readonly VITE_CURRENCY: string;
  /** Optional origin that serves uploaded files (e.g. https://api.example.com).
   *  Defaults to the API origin when VITE_API_BASE_URL is absolute. */
  readonly VITE_UPLOADS_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
