/**
 * Put the QR reader's WebAssembly where the app can serve it itself.
 *
 * `zxing-wasm` fetches its own binary from a CDN unless it is told otherwise, and a
 * receipt scanner that stops working when someone else's CDN does is not a scanner. This
 * copies the binary that came with the installed version into `public/`, so the page asks
 * this app for it and gets the one that matches the code calling it.
 *
 * Run before `dev` and before `build`, so the copy can never be a version behind.
 */
import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const from = join(root, "node_modules/zxing-wasm/dist/reader/zxing_reader.wasm");
const to = join(root, "public/zxing_reader.wasm");

if (!existsSync(from)) {
  console.warn("copy-zxing: zxing-wasm is not installed — the receipt scanner will not load.");
  process.exit(0);
}

// Skip an identical copy so `dev` does not touch the file on every restart.
if (existsSync(to) && statSync(to).size === statSync(from).size) process.exit(0);

mkdirSync(dirname(to), { recursive: true });
copyFileSync(from, to);
console.log("copy-zxing: public/zxing_reader.wasm updated");
