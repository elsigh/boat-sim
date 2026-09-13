import assert from "node:assert/strict";
import { test } from "node:test";
import { ceremonyStage, ceremonyTiming } from "./roche-ceremony";

test("Roche salute follows the decoded bugle duration, with breathing room between sounds", () => {
  for (const duration of [32, 59.19, 75]) {
    const times = ceremonyTiming(duration);
    assert.equal(ceremonyStage(0, duration), "taps");
    assert.equal(ceremonyStage(duration, duration), "taps");
    assert.ok(times.cannonAt > duration + 1);
    assert.equal(ceremonyStage(times.cannonAt, duration), "cannon");
    assert.ok(times.hornsAt > times.cannonAt + 2);
    assert.equal(ceremonyStage(times.hornsAt, duration), "horns");
    assert.equal(ceremonyStage(times.duration - 0.1, duration), "horns");
    assert.equal(ceremonyStage(times.duration, duration), "complete");
    assert.equal(ceremonyStage(times.duration + 100, duration), "complete");
  }
});
