import test from "node:test";
import assert from "node:assert/strict";
import { stepRunner, createRunner } from "../src/runner.js";
test("jump clears a ground obstacle and finishes deterministically", () => {
  let a = createRunner(42),
    b = createRunner(42);
  assert.deepEqual(a.obstacles, b.obstacles);
  a = { ...a, obstacles: [], duration: 1 };
  a = stepRunner(a, 0.05, true);
  assert.ok(a.y > 0);
  for (let i = 0; i < 50; i++) a = stepRunner(a, 0.05, false);
  assert.equal(a.finished, true);
});
test("collision resets obstacle but never removes learning progress", () => {
  let a = {
    ...createRunner(2),
    obstacles: [{ x: 110, hit: false }],
    duration: 10,
  };
  a = stepRunner(a, 0.05, false);
  assert.equal(a.bumps, 1);
  a = stepRunner(a, 0.05, false);
  assert.equal(a.bumps, 1);
});
test("delta is bounded and runner does not mutate input", () => {
  const a = createRunner(1),
    b = stepRunner(a, 999, false);
  assert.equal(a.time, 0);
  assert.ok(b.time <= 0.05);
});
test("escape equipment changes traversal: boat rides water, wings glide, rope vaults", () => {
  const trail = stepRunner(createRunner(1, "trail"), 0.05, true);
  const wing = stepRunner(createRunner(1, "wings"), 0.05, true);
  const rope = stepRunner(createRunner(1, "rope"), 0.05, true);
  const boat = createRunner(1, "boat");
  assert.equal(boat.mode, "boat");
  assert.ok(rope.y > trail.y);
  assert.ok(wing.vy > trail.vy);
});
