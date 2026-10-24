import test from "node:test";
import assert from "node:assert/strict";
import { basename } from "node:path";

import {
  getExportFileLocation,
  resolveStoredExportPath,
} from "../../../dist/src/exports/export-files.js";

test("создаёт безопасный путь CSV по export ID", () => {
  const result = getExportFileLocation("15");

  assert.equal(result.fileKey, "applications-15.csv");
  assert.equal(basename(result.absolutePath), "applications-15.csv");
});

test("не принимает произвольный export ID", () => {
  assert.throws(() => getExportFileLocation("../15"), /Некорректный export ID/);
});

test("не принимает произвольный сохранённый путь", () => {
  assert.throws(
    () => resolveStoredExportPath("15", "../../secret.txt"),
    /Неизвестный формат пути экспорта/,
  );
});
