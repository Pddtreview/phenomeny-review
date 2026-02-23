import { cpSync, existsSync } from "fs";
import { join } from "path";

const cwd = process.cwd();
const standalonePath = join(cwd, ".next", "standalone");

if (!existsSync(standalonePath)) {
  console.error("Standalone output not found. Make sure next.config.mjs has output: 'standalone'");
  process.exit(1);
}

cpSync(join(cwd, "public"), join(standalonePath, "public"), { recursive: true });
console.log("Copied public/ into standalone");

const staticSrc = join(cwd, ".next", "static");
if (existsSync(staticSrc)) {
  cpSync(staticSrc, join(standalonePath, ".next", "static"), { recursive: true });
  console.log("Copied .next/static/ into standalone");
}

console.log("Standalone build ready");
