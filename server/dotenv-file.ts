import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const ENVIRONMENT_NAME = /^[A-Z][A-Z0-9_]*$/;

export async function updateDotEnv(
  path: string,
  updates: Record<string, string>
): Promise<string[]> {
  const entries = Object.entries(updates);
  for (const [name, value] of entries) {
    if (!ENVIRONMENT_NAME.test(name)) {
      throw new Error(`Invalid environment variable name: ${name}`);
    }
    if (/[\r\n\0]/.test(value)) {
      throw new Error(`Environment variable ${name} contains an unsupported character.`);
    }
  }

  let source = "";
  try {
    source = await readFile(path, "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") throw error;
  }

  const pending = new Map(entries);
  const lines = source ? source.replace(/\r\n/g, "\n").split("\n") : [];
  const next = lines.map((line) => {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=/);
    if (!match || !pending.has(match[1]!)) return line;

    const name = match[1]!;
    const value = pending.get(name)!;
    pending.delete(name);
    return `${name}=${value}`;
  });

  if (pending.size) {
    while (next.length && next[next.length - 1] === "") next.pop();
    if (next.length) next.push("");
    next.push("# Managed Alibaba Cloud deployment values");
    for (const [name, value] of pending) next.push(`${name}=${value}`);
  }

  const output = `${next.join("\n").replace(/\n+$/, "")}\n`;
  const temporaryPath = `${path}.${process.pid}.tmp`;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(temporaryPath, output, { encoding: "utf8", mode: 0o600 });
  await rename(temporaryPath, path);
  return entries.map(([name]) => name);
}
