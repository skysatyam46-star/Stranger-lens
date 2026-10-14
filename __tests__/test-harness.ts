import { describe, test } from "node:test";
import assert from "node:assert";

export { describe, test };

export function expect(actual: any) {
  return {
    toBe(expected: any) {
      assert.strictEqual(actual, expected);
    },
    not: {
      toBe(expected: any) {
        assert.notStrictEqual(actual, expected);
      },
      toContain(item: any) {
        if (typeof actual === "string" || Array.isArray(actual)) {
          assert.ok(!actual.includes(item), `Expected not to contain ${item}`);
        }
      },
      toHaveProperty(prop: string) {
        assert.ok(!actual || !(prop in actual), `Expected object not to have property ${prop}`);
      },
    },
    toBeGreaterThanOrEqual(expected: number) {
      assert.ok(actual >= expected, `Expected ${actual} >= ${expected}`);
    },
    toBeLessThan(expected: number) {
      assert.ok(actual < expected, `Expected ${actual} < ${expected}`);
    },
    toBeLessThanOrEqual(expected: number) {
      assert.ok(actual <= expected, `Expected ${actual} <= ${expected}`);
    },
    toBeGreaterThan(expected: number) {
      assert.ok(actual > expected, `Expected ${actual} > ${expected}`);
    },
    toBeDefined() {
      assert.ok(actual !== undefined, "Expected to be defined");
    },
    toBeTruthy() {
      assert.ok(Boolean(actual), "Expected to be truthy");
    },
    toContain(item: any) {
      if (typeof actual === "string" || Array.isArray(actual)) {
        assert.ok(actual.includes(item), `Expected ${JSON.stringify(actual)} to contain ${item}`);
      } else {
        assert.fail(`Actual is not string or array`);
      }
    },
    toHaveProperty(prop: string) {
      assert.ok(actual && typeof actual === "object" && prop in actual, `Expected property ${prop}`);
    },
    toEqual(expected: any) {
      assert.deepStrictEqual(actual, expected);
    },
  };
}
