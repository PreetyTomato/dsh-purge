// Marker-presence audit: for each patch in ALL_PATCHES, does its marker already
// exist somewhere on the UNPACKED on-disk tree? This distinguishes "applied but
// anchor reworded" (marker present) from "genuinely not applied" (marker absent).
import fs from "node:fs";
import path from "node:path";
import { ALL_PATCHES } from "../lib/core.js";

const AI = process.env.PURGE_AI_DIR
  || "D:\\deepseekHARNESS\\resources\\app\\dsh\\node_modules\\@deepseek-ai";

// Concatenate all lib/*.js under every @deepseek-ai package (skip typ).
let blob = "";
for (const d of fs.readdirSync(AI, { withFileTypes: true })) {
  if (!d.isDirectory()) continue;
  const lib = path.join(AI, d.name, "lib");
  if (!fs.existsSync(lib)) continue;
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".js")) blob += fs.readFileSync(p, "utf8") + "\n";
    }
  };
  walk(lib);
}

const norm = (s) => s.replace(/\r\n/g, "\n");
const B = norm(blob);
let applied = 0, notApplied = 0;
const absent = [];
for (const p of ALL_PATCHES) {
  const markers = Array.isArray(p.markers) ? p.markers : (p.marker ? [p.marker] : []);
  if (!markers.length) { continue; }
  const any = markers.some((m) => B.includes(norm(m)));
  if (any) applied++; else { notApplied++; absent.push(p.id); }
}
console.log("patches with markers:", applied + notApplied);
console.log("  already applied (marker present):", applied);
console.log("  marker absent (not applied / needs work):", notApplied);
console.log("  absent ids:", absent.join(", "));
