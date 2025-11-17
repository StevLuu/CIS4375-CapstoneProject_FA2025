/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_API_URL?: string;
    readonly VITE_XSRF_COOKIE?: string;
    readonly VITE_XSRF_HEADER?: string;
  }
  
  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
  