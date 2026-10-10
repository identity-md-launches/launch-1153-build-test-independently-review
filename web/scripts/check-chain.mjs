import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const temp = await mkdtemp(join(tmpdir(), "prism-chain-check-"));
try {
  const out = join(temp, "check.mjs");
  await build({
    entryPoints: [resolve(here, "chain-tests.ts")],
    outfile: out,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    logLevel: "silent",
  });
  await import(pathToFileURL(out).href);
} finally {
  await rm(temp, { recursive: true, force: true });
}
