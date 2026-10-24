import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import * as argon2 from "argon2";

await access("dist/src/main.js");
await access("dist/src/workers/export.worker.js");

const password = "container-only-diagnostic";

const hash = await argon2.hash(password, {
  type: argon2.argon2id,
});

assert.equal(await argon2.verify(hash, password), true);

assert.equal(await argon2.verify(hash, password + "-wrong"), false);

console.log("Container files and password verification: OK");
console.log("UID:", process.getuid?.());
