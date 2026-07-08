import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

// Renders electron/resources/icon.svg into icon.icns (and icon.png for
// previews). Requires macOS iconutil.

const resourcesDir = path.resolve("electron/resources");
const svg = readFileSync(path.join(resourcesDir, "icon.svg"));
const iconsetDir = path.join(resourcesDir, "icon.iconset");

rmSync(iconsetDir, { recursive: true, force: true });
mkdirSync(iconsetDir, { recursive: true });

const sizes = [16, 32, 64, 128, 256, 512, 1024];

for (const size of sizes) {
  const png = await sharp(svg, { density: (72 * size) / 1024 * 4 })
    .resize(size, size)
    .png()
    .toBuffer();

  if (size <= 512) {
    await sharp(png).toFile(path.join(iconsetDir, `icon_${size}x${size}.png`));
  }

  if (size >= 32) {
    await sharp(png).toFile(
      path.join(iconsetDir, `icon_${size / 2}x${size / 2}@2x.png`),
    );
  }
}

await sharp(svg, { density: 288 })
  .resize(1024, 1024)
  .png()
  .toFile(path.join(resourcesDir, "icon.png"));

execFileSync("iconutil", [
  "-c",
  "icns",
  iconsetDir,
  "-o",
  path.join(resourcesDir, "icon.icns"),
]);

rmSync(iconsetDir, { recursive: true, force: true });
console.log("Wrote electron/resources/icon.icns and icon.png");
