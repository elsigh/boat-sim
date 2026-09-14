/** Set up a shot through the simulator's own controls in d3k. */
import { managedBrowser } from "./managed-browser.mjs";
import { writeFileSync, mkdirSync } from "node:fs";
const [
  exercise = "arrive-roche",
  view = "Fwd",
  boat = "",
  stop = "roche-harbor-marina",
] = process.argv.slice(2);
const b = await managedBrowser();
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const click = async (text) =>
  b.evaluate(
    `(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.offsetParent!==null&&(b.textContent.trim().toLowerCase()===${JSON.stringify(text.toLowerCase())}||b.getAttribute('aria-label')===${JSON.stringify(text)}));if(!b)throw new Error('Missing button: '+${JSON.stringify(text)});b.click();return true})()`,
  );
const select = async (value) =>
  b.evaluate(
    `(()=>{const s=[...document.querySelectorAll('select')].find(s=>[...s.options].some(o=>o.value===${JSON.stringify(value)}));if(!s)throw new Error('Missing option: '+${JSON.stringify(value)});s.value=${JSON.stringify(value)};s.dispatchEvent(new Event('change',{bubbles:true}));return true})()`,
  );
try {
  await b.send("Page.bringToFront");
  await b.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await b.send("Emulation.setDeviceMetricsOverride", {
    width: 1920,
    height: 1080,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await b.evaluate(
    `window.__releaseOriginalGamepads ||= navigator.getGamepads.bind(navigator);Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[]});window.dispatchEvent(new KeyboardEvent('keydown',{key:' ',bubbles:true}));document.querySelector('#release-download')?.remove();true`,
  );
  if (boat) {
    await click("Expand").catch(() => {});
    await select(boat);
    await pause(1500);
    await click("Collapse").catch(() => {});
  }
  await select(stop);
  await pause(1800);
  if (exercise) await select(exercise);
  await pause(1800);
  await click("Calm");
  await click(view);
  await click("START ENGINES").catch(() => {});
  await pause(5500);
  // A three-quarter view keeps the whole hull in the film's landscape and portrait crops.
  if (view === "Top") {
    await b.send("Input.dispatchMouseEvent", {
      type: "mousePressed",
      x: 1100,
      y: 500,
      button: "left",
      clickCount: 1,
    });
    await b.send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: 1220,
      y: 590,
      button: "left",
      buttons: 1,
    });
    await b.send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x: 1220,
      y: 590,
      button: "left",
      clickCount: 1,
    });
    await pause(800);
  }
  mkdirSync(".release-media/raw", { recursive: true });
  const shot = await b.send("Page.captureScreenshot", { format: "png" });
  writeFileSync(
    ".release-media/raw/setup.png",
    Buffer.from(shot.data, "base64"),
  );
  console.log(await b.evaluate("document.body.innerText.slice(-600)"));
} finally {
  b.close();
}
