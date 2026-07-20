import assert from "node:assert/strict";

import {
  buildCorsHeaders,
  isCorsOriginAllowed,
  parseCorsOrigins
} from "../server/cors.js";

const origins = parseCorsOrigins(
  "https://demo.example.com, http://localhost:4173, *, javascript:alert(1)"
);

assert.equal(isCorsOriginAllowed("https://mongonsh.github.io", origins), true);
assert.equal(isCorsOriginAllowed("https://demo.example.com", origins), true);
assert.equal(isCorsOriginAllowed("http://localhost:4173", origins), true);
assert.equal(isCorsOriginAllowed("https://attacker.example", origins), false);
assert.equal(isCorsOriginAllowed("null", origins), false);

assert.deepEqual(
  buildCorsHeaders("https://attacker.example", origins),
  {}
);
assert.equal(
  buildCorsHeaders("https://mongonsh.github.io", origins)[
    "Access-Control-Allow-Origin"
  ],
  "https://mongonsh.github.io"
);

console.log("cors tests passed");

