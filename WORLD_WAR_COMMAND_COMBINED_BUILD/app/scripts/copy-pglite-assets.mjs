import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const destDirs = [
  join(".vercel", "output", "functions", "__server.func", "_libs"),
  join(".output", "server", "_libs"),
];
const srcDir = join("node_modules", "@electric-sql", "pglite", "dist");
const files = ["pglite.data", "pglite.wasm", "initdb.wasm"];

const existingDests = destDirs.filter((dir) => existsSync(dir));
if (existingDests.length === 0) {
  console.log("[pglite] no server bundle — skipping asset copy");
  process.exit(0);
}

for (const destDir of existingDests) {
  for (const name of files) {
    copyFileSync(join(srcDir, name), join(destDir, name));
  }
  console.log(`[pglite] copied data and wasm next to the server bundle (${destDir})`);
}
