import assert from "node:assert/strict";
import { test } from "node:test";
import { BoxGeometry, Matrix4, Vector3 } from "three";
import { appendClippedGeometry, emptyFragment, fragmentGeometry } from "./fracture-geometry";

test("real hull/deck triangles are cut at seams without losing surface area or UVs", () => {
  const source = new BoxGeometry(4, 2, 12), output = emptyFragment();
  const transform = new Matrix4().makeTranslation(10, 0, 20);
  let totalArea = 0;
  for (let row = 0; row < 4; row++) for (const side of [-1, 1]) {
    const b = { left: side < 0 ? 8 : 10, right: side < 0 ? 10 : 12, aft: 14 + row * 3, fore: 17 + row * 3 };
    const fragment = emptyFragment();
    appendClippedGeometry(source, transform, 0, source.index!.count, b, fragment);
    const g = fragmentGeometry(fragment), p = g.getAttribute("position"), uv = g.getAttribute("uv");
    assert.equal(p.count, uv.count);
    for (let i = 0; i < p.count; i++) {
      assert.ok(p.getX(i) >= b.left && p.getX(i) <= b.right);
      assert.ok(p.getZ(i) >= b.aft && p.getZ(i) <= b.fore);
      assert.ok(Number.isFinite(uv.getX(i)) && Number.isFinite(uv.getY(i)));
    }
    for (let i = 0; i < p.count; i += 3) {
      const a = new Vector3().fromBufferAttribute(p, i), b = new Vector3().fromBufferAttribute(p, i + 1), c = new Vector3().fromBufferAttribute(p, i + 2);
      totalArea += b.sub(a).cross(c.sub(a)).length() / 2;
    }
    g.dispose();
  }
  assert.ok(Math.abs(totalArea - 160) < 1e-5, String(totalArea));
  appendClippedGeometry(source, transform, 0, source.index!.count, {left:0,right:1,aft:0,fore:1}, output);
  assert.equal(output.positions.length, 0);
  source.dispose();
});
