import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

export default defineConfig({
  server: {
    port: 3000,
    strictPort: true,
    ...(isCodexSeatbeltSandbox
      ? { watch: { useFsEvents: false, usePolling: true } }
      : {}),
  },
  plugins: [react()],
  build: { sourcemap: true },
});
