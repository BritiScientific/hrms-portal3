import react from "@vitejs/plugin-react";
import { build } from "vite";

await build({
  configFile: false,
  plugins: [react()],
  logLevel: "info"
});
