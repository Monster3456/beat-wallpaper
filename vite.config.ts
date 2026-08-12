import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";

// 前端日志转发插件：壁纸层窗口的 console 错误通过 /__log 端点打印到终端
function frontendLog(): Plugin {
  return {
    name: "frontend-log",
    configureServer(server) {
      server.middlewares.use("/__log", (req, res) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        const msg = decodeURIComponent(url.searchParams.get("m") ?? "");
        console.log("[FRONTEND]", msg.trimEnd());
        res.statusCode = 200;
        res.end("ok");
      });
    },
  };
}

const host = process.env.TAURI_DEV_HOST;

export default defineConfig(async () => ({
  plugins: [react(), frontendLog()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));