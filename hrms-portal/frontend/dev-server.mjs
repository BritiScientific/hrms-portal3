import react from "@vitejs/plugin-react";
import { createServer } from "vite";

const server = await createServer({
  configFile: false,
  plugins: [react()],
  optimizeDeps: { noDiscovery: true, include: [] },
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    proxy: {
      "/api/v1": {
        target: "http://127.0.0.1:5001",
        changeOrigin: true
      }
    }
  }
});

await server.listen();
server.printUrls();
