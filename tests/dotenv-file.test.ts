import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { updateDotEnv } from "../server/dotenv-file.js";

const directory = await mkdtemp(join(tmpdir(), "quotex-env-"));
const path = join(directory, ".env");

try {
  await writeFile(path, "# Existing\nKEEP=yes\nREPLACE=old\n", "utf8");
  const names = await updateDotEnv(path, {
    REPLACE: "new",
    ADDED_VALUE: "created"
  });
  const result = await readFile(path, "utf8");

  assert.deepEqual(names, ["REPLACE", "ADDED_VALUE"]);
  assert.match(result, /KEEP=yes/);
  assert.match(result, /REPLACE=new/);
  assert.match(result, /ADDED_VALUE=created/);
  assert.equal(result.includes("REPLACE=old"), false);
  await assert.rejects(() => updateDotEnv(path, { BAD: "line\nbreak" }));
} finally {
  await rm(directory, { recursive: true, force: true });
}

console.log("dotenv-file tests passed");
