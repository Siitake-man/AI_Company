import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "fs";

try {
  let appContent = fs.readFileSync('C:/Users/bonob/Project/AI_Comany/src/App.tsx', 'utf8');
  let promptContent = fs.readFileSync('C:/Users/bonob/Project/AI_Comany/src/lib/promptMerger.ts', 'utf8');
  
  const editsText = fs.readFileSync('C:/Users/bonob/Project/AI_Comany/app_tsx_edits.txt', 'utf8');
  const editBlocks = editsText.split('\n\n');
  
  let failed = "";
  
  for (const block of editBlocks) {
    if (!block.trim()) continue;
    try {
      const call = JSON.parse(block);
      if (call.name === "replace_file_content") {
        const target = call.args.TargetContent;
        const replace = call.args.ReplacementContent;
        const file = call.args.TargetFile;
        
        if (file.includes("App.tsx")) {
          if (!appContent.includes(target)) {
            failed += "FAILED REPLACE IN APP.TSX:\n" + target + "\n\n";
          }
        } else if (file.includes("promptMerger.ts")) {
          if (!promptContent.includes(target)) {
            failed += "FAILED REPLACE IN PROMPT:\n" + target + "\n\n";
          }
        }
      } else if (call.name === "multi_replace_file_content") {
        const chunks = call.args.ReplacementChunks;
        for (const chunk of chunks) {
          const target = chunk.TargetContent;
          if (call.args.TargetFile.includes("App.tsx")) {
            if (!appContent.includes(target)) {
              failed += "FAILED MULTI IN APP.TSX:\n" + target + "\n\n";
            }
          }
        }
      }
    } catch(e) {}
  }
  
  fs.writeFileSync('C:/Users/bonob/Project/AI_Comany/failed_edits.txt', failed, 'utf8');
} catch (e) {}

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: process.env.TAURI_DEV_HOST || false,
    hmr: process.env.TAURI_DEV_HOST
      ? {
          protocol: "ws",
          host: process.env.TAURI_DEV_HOST,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
