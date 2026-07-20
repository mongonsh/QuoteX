import assert from "node:assert/strict";

import {
  accessTokenFromUrl,
  apiBaseUrlForHostname,
  resolveQuoteXApiUrl
} from "../src/api-client.js";

const cloudApiBase =
  "https://quotex-utopilot-vybltedhtp.ap-northeast-1.fcapp.run";

assert.equal(apiBaseUrlForHostname("mongonsh.github.io"), cloudApiBase);
assert.equal(apiBaseUrlForHostname("MONGONSH.GITHUB.IO"), cloudApiBase);
assert.equal(apiBaseUrlForHostname("127.0.0.1"), "");
assert.equal(
  resolveQuoteXApiUrl("/api/health", "mongonsh.github.io"),
  `${cloudApiBase}/api/health`
);
assert.equal(resolveQuoteXApiUrl("/api/health", "127.0.0.1"), "/api/health");
assert.equal(
  resolveQuoteXApiUrl("https://signed.example.test/product.jpg", "mongonsh.github.io"),
  "https://signed.example.test/product.jpg"
);
assert.equal(
  accessTokenFromUrl("https://mongonsh.github.io/QuoteX/#access=private-demo-token"),
  "private-demo-token"
);
assert.equal(
  accessTokenFromUrl("https://mongonsh.github.io/QuoteX/?access=legacy-token"),
  "legacy-token"
);
assert.equal(accessTokenFromUrl("not a URL"), "");

console.log("api-client tests passed");
