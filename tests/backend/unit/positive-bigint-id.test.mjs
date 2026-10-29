import test from "node:test";
import assert from "node:assert/strict";

import { parsePositiveBigIntId } from "../../../dist/src/validation/positive-bigint-id.js";

test("принимает корректный положительный BIGINT ID", () => {
  assert.equal(parsePositiveBigIntId("42"), "42");

  assert.equal(
    parsePositiveBigIntId("9223372036854775807"),
    "9223372036854775807",
  );
});

test("отклоняет некорректные ID", () => {
  const invalidValues = [
    0,
    "0",
    "-1",
    "1e3",
    "01",
    "",
    "9223372036854775808",
    "9".repeat(1000),
    {},
    null,
    undefined,
  ];

  for (const value of invalidValues) {
    assert.equal(
      parsePositiveBigIntId(value),
      null,
      `Значение ${String(value)} должно быть отклонено`,
    );
  }
});
