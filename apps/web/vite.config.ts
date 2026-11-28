import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const vendoredFiles = ["**/repos/**", "**/packages/sources/**"];

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    watch: { ignored: vendoredFiles },
    fs: {
      deny: [
        ".env",
        ".env.*",
        "*.{crt,pem,key,p12,pfx,cer,der}",
        ".npmrc",
        ".yarnrc.yml",
        "**/.git/**",
        ...vendoredFiles,
      ],
    },
  },
  preview: { host: "127.0.0.1", port: 4173 },
});
