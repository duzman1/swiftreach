// One-off logo generator. Run with:
//   node scripts/generate-logo.mjs
//
// Produces:
//   public/logo.png       — 512×512  (Google OAuth verification + app icons)
//   public/logo-192.png   — 192×192  (smaller variant: PWA manifest, etc.)
//
// The source is an inline SVG so the bolt is rendered as a vector path
// (not a system font glyph) — this means the output is pixel-identical
// across machines and looks crisp at every size.
//
// Re-run this script any time you want to refresh the PNGs from the SVG.
// Commit the PNGs to the repo — don't make the build pipeline run sharp.

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, "..", "public");

// Brand colours — keep in sync with tailwind.config's `whatsapp` token.
const GREEN = "#25D366";
const WHITE = "#ffffff";

// Lightning bolt path, centered around (256, 256) inside a 512×512 viewBox.
// 6-point zigzag — top-right → mid-left "wing" → bottom point → mid-right
// "wing" → back to top. Bounding box: x 144→368, y 64→448. Visually
// centred; bbox center = (256, 256).
const BOLT_PATH =
  "M 320 64 L 144 280 L 232 280 L 192 448 L 368 232 L 280 232 Z";

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <!-- Rounded-square background; rx=96 (~18.75%) matches iOS app-icon style
       and reads as "SwiftReach brand mark" alongside our in-app green tile. -->
  <rect width="512" height="512" rx="96" ry="96" fill="${GREEN}"/>
  <!-- Lightning bolt: stylises "Swift" without depending on font availability. -->
  <path d="${BOLT_PATH}" fill="${WHITE}"/>
</svg>
`;

await mkdir(PUBLIC_DIR, { recursive: true });

async function render(size, filename) {
  const out = join(PUBLIC_DIR, filename);
  await sharp(Buffer.from(svg))
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(out);
  console.log(`  wrote ${filename} (${size}×${size})`);
}

console.log("Generating SwiftReach logos…");
await render(512, "logo.png");
await render(192, "logo-192.png");
// Also write the source SVG so a designer can iterate on it later without
// digging through this script.
await writeFile(join(PUBLIC_DIR, "logo.svg"), svg, "utf8");
console.log("  wrote logo.svg");
console.log("Done.");
