/** Record the real WebGL canvas in the existing d3k-managed page. */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { managedBrowser } from "./managed-browser.mjs";

const [name, secondsArg = "10", keys = "", effect = ""] = process.argv.slice(2);
if (!name || !/^[a-z0-9-]+$/.test(name))
  throw new Error(
    "Usage: node scripts/marketing/capture.mjs shot-name [seconds] [held-keys]",
  );
const seconds = Number(secondsArg);
if (!(seconds > 0 && seconds <= 30))
  throw new Error("Capture duration must be 1–30 seconds.");
const output = resolve(process.env.BOATSIM_CAPTURE_DIR || ".release-media/raw");
mkdirSync(output, { recursive: true });
const browser = await managedBrowser();
try {
  await browser.send("Page.bringToFront");
  await browser.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await browser.send("Emulation.setDeviceMetricsOverride", {
    width: 1920,
    height: 1080,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await new Promise((r) => setTimeout(r, 600));
  const result = await browser.evaluate(`(async () => {
    const canvas = document.querySelector('canvas');
    if (!canvas) throw new Error('Open the simulator before capturing.');
    const stream = canvas.captureStream(30);
    const mimeType = 'video/webm;codecs=vp9';
    const recorder = new MediaRecorder(stream, {mimeType,videoBitsPerSecond:14000000});
    const chunks = [];
    let turboTimer;
    if (${JSON.stringify(effect)} === 'turbo') turboTimer = setTimeout(()=>window.dispatchEvent(new KeyboardEvent('keydown',{key:'t',bubbles:true})),4500);
    const held = ${JSON.stringify([...keys])};
    recorder.ondataavailable = e => {if(e.data.size) chunks.push(e.data)};
    try {
      const finished = new Promise((resolve,reject)=>{recorder.onstop=resolve;recorder.onerror=reject});
      recorder.start(500);
      held.forEach(key=>window.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true})));
      await new Promise(resolve=>setTimeout(resolve,${seconds * 1000}));
      recorder.stop();
      await finished;
      const blob = new Blob(chunks,{type:mimeType});
      const data = await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(blob)});
      return {data,width:canvas.width,height:canvas.height,bytes:blob.size};
    } finally {
      clearTimeout(turboTimer);
      held.forEach(key=>window.dispatchEvent(new KeyboardEvent('keyup',{key,bubbles:true})));
      window.dispatchEvent(new KeyboardEvent('keydown',{key:' ',bubbles:true}));
      stream.getTracks().forEach(t=>t.stop());
    }
  })()`);
  if (result.bytes < 1000)
    throw new Error(
      "No video frames captured; bring the managed page to the front and retry.",
    );
  writeFileSync(
    resolve(output, `${name}.webm`),
    Buffer.from(result.data.split(",")[1], "base64"),
  );
  console.log(
    `${name}: ${result.width}×${result.height}, ${(result.bytes / 1e6).toFixed(1)} MB → ${output}`,
  );
} finally {
  browser.close();
}
