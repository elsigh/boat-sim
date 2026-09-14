/** Save an actual helm detail or expanded plotter from the managed browser. */
import { managedBrowser } from "./managed-browser.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
const kind = process.argv[2];
if (!["helm", "chart"].includes(kind))
  throw new Error("Usage: node scripts/marketing/detail.mjs helm|chart");
const b = await managedBrowser();
try {
  await b.send("Page.bringToFront");
  await b.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await b.send("Emulation.setDeviceMetricsOverride", {
    width: 1920,
    height: 1080,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await new Promise((r) => setTimeout(r, 500));
  if (kind === "helm") {
    await b.evaluate(
      `window.dispatchEvent(new KeyboardEvent('keydown',{key:' ',bubbles:true}));['w','k'].forEach(key=>window.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true})));true`,
    );
    await new Promise((r) => setTimeout(r, 4200));
    await b.evaluate(
      `['w','k'].forEach(key=>window.dispatchEvent(new KeyboardEvent('keyup',{key,bubbles:true})));true`,
    );
  } else {
    await b.evaluate(
      `[...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')==='Expand plotter')?.click();true`,
    );
    await new Promise((r) => setTimeout(r, 900));
  }
  mkdirSync(".release-media/raw", { recursive: true });
  const screenshot = await b.send("Page.captureScreenshot", { format: "png" });
  writeFileSync(
    `.release-media/raw/${kind}.png`,
    Buffer.from(screenshot.data, "base64"),
  );
  console.log(`Saved ${kind} screenshot`);
} finally {
  await b
    .evaluate(
      `['w','k'].forEach(key=>window.dispatchEvent(new KeyboardEvent('keyup',{key,bubbles:true})));window.dispatchEvent(new KeyboardEvent('keydown',{key:' ',bubbles:true}));true`,
    )
    .catch(() => {});
  b.close();
}
