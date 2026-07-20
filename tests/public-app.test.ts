import assert from "node:assert/strict";

import {
  buildPublicAppRedirect,
  normalizePublicAppUrl
} from "../server/public-app.js";

assert.equal(
  normalizePublicAppUrl("https://mongonsh.github.io/QuoteX/?ignored=true#old"),
  "https://mongonsh.github.io/QuoteX/"
);
assert.equal(normalizePublicAppUrl("javascript:alert(1)"), "");
assert.equal(normalizePublicAppUrl("https://user:password@example.com"), "");
assert.equal(
  buildPublicAppRedirect(
    "https://mongonsh.github.io/QuoteX/",
    "private demo token"
  ),
  "https://mongonsh.github.io/QuoteX/#access=private+demo+token"
);
assert.equal(buildPublicAppRedirect("not a URL", "token"), "");

console.log("public-app tests passed");
