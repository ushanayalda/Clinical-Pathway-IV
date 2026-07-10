import { spawn } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { access, chmod, mkdir, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
import { createBrotliDecompress } from "node:zlib";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const binaryRoot = join(projectRoot, "node_modules", "@sparticuz", "chromium", "bin");
export const runtimeRoot = join(projectRoot, ".cache", "chromium-runtime");
export const chromiumPath = join(runtimeRoot, "chromium");

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function decompress(source, destination) {
  await pipeline(
    createReadStream(source),
    createBrotliDecompress({ chunkSize: 2 ** 21 }),
    createWriteStream(destination, { mode: 0o700 })
  );
}

async function extractTar(source, destination, label) {
  await mkdir(destination, { recursive: true });
  const tarPath = join(runtimeRoot, `${label}.tar`);
  await decompress(source, tarPath);

  await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn("tar", ["--no-same-owner", "--no-same-permissions", "-xf", tarPath, "-C", destination], {
      stdio: ["ignore", "pipe", "pipe"]
    });
    let error = "";
    child.stderr.on("data", (chunk) => { error += chunk.toString(); });
    child.once("error", rejectPromise);
    child.once("exit", (code) => {
      if (code === 0) resolvePromise();
      else rejectPromise(new Error(`Could not extract ${label}: ${error}`));
    });
  });

  await rm(tarPath, { force: true });
}

export async function prepareChromium() {
  if (await exists(chromiumPath)) return chromiumPath;

  await mkdir(runtimeRoot, { recursive: true });
  await Promise.all([
    decompress(join(binaryRoot, "chromium.br"), chromiumPath),
    extractTar(join(binaryRoot, "fonts.tar.br"), join(runtimeRoot, "fonts"), "fonts"),
    extractTar(join(binaryRoot, "swiftshader.tar.br"), runtimeRoot, "swiftshader"),
    extractTar(join(binaryRoot, "al2023.tar.br"), join(runtimeRoot, "al2023"), "al2023")
  ]);
  await chmod(chromiumPath, 0o700);
  return chromiumPath;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(await prepareChromium());
}
