/** Render the actual BoatVisual models as lightweight fleet-page images. */
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { managedBrowser } from "./managed-browser.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const route = `${root}src/app/boat-portrait-studio`;
const output = `${root}public/media/boats`;
const browser = await managedBrowser();
let installed = false;
try {
  // Refuse to overwrite an existing route. Remove only the directory we create.
  mkdirSync(route);
  installed = true;
  copyFileSync(new URL("./boat-portrait-studio.tsx", import.meta.url), `${route}/page.tsx`);
  mkdirSync(output, { recursive: true });
  await browser.send("Page.enable");
  await browser.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await browser.send("Emulation.setDeviceMetricsOverride", { width: 1200, height: 750, deviceScaleFactor: 1, mobile: false });
  async function open(slug = "") {
    await browser.send("Page.navigate", { url: `${browser.url}/boat-portrait-studio?boat=${encodeURIComponent(slug)}` });
    const deadline = Date.now() + 45000;
    while (Date.now() < deadline) {
      const ready = await browser.evaluate(`document.querySelector('[data-portrait-ready]')?.getAttribute('data-portrait-ready')`);
      if (ready && (!slug || ready === slug)) return ready;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    throw new Error(`Boat portrait did not render: ${slug}`);
  }
  await open();
  const slugs = await browser.evaluate(`document.querySelector('[data-boat-slugs]').getAttribute('data-boat-slugs').split(',')`);
  for (const slug of slugs) {
    await open(slug);
    const data = await browser.evaluate(`document.querySelector('canvas').toDataURL('image/png').split(',')[1]`);
    const image = await sharp(Buffer.from(data, "base64")).webp({ quality: 88 }).toBuffer();
    writeFileSync(`${output}/${slug}.webp`, image);
    console.log(`${slug}: ${Math.round(image.length / 1024)} KB`);
  }
} finally {
  if (installed) rmSync(route, { recursive: true });
  await browser.send("Emulation.clearDeviceMetricsOverride");
  await browser.send("Emulation.setFocusEmulationEnabled", { enabled: false });
  await browser.send("Page.navigate", { url: `${browser.url}/boats` });
  browser.close();
}
