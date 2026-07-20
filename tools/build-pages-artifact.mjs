import { cp, mkdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = join(root, ".runtime", "pages");

await rm(output, { recursive: true, force: true });
await mkdir(join(output, "src"), { recursive: true });
await mkdir(join(output, "dist"), { recursive: true });

await Promise.all([
  cp(join(root, "index.html"), join(output, "index.html")),
  cp(join(root, "assets"), join(output, "assets"), { recursive: true }),
  cp(join(root, "src", "styles.css"), join(output, "src", "styles.css")),
  cp(join(root, "dist", "src"), join(output, "dist", "src"), { recursive: true }),
  writeFile(join(output, ".nojekyll"), "")
]);

const index = await stat(join(output, "index.html"));
console.log(
  JSON.stringify(
    {
      ok: true,
      platform: "GitHub Pages",
      artifact: output,
      entrypointBytes: index.size,
      backend: "Alibaba Cloud Function Compute"
    },
    null,
    2
  )
);

