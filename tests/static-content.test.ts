import assert from "node:assert/strict";

import { contentTypeForPath } from "../server/static-content.js";

assert.equal(contentTypeForPath("/assets/product.png"), "image/png");
assert.equal(contentTypeForPath("/assets/product.JPEG"), "image/jpeg");
assert.equal(contentTypeForPath("/media/voice.wav"), "audio/wav");
assert.equal(contentTypeForPath("/dist/app.js"), "text/javascript; charset=utf-8");
assert.equal(contentTypeForPath("/data/unknown.bin"), "application/octet-stream");

console.log("static-content tests passed");
