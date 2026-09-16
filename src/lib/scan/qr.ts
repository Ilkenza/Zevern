/**
 * Reading a QR code, in the browser, and nowhere else.
 *
 * The decoder is WebAssembly and it is about a megabyte, so it is imported the first time
 * somebody actually opens the scanner rather than on every page load — a person who never
 * scans a receipt never downloads it.
 *
 * Two things were measured before this library was chosen rather than the smaller obvious
 * one. A Serbian fiscal QR carries around 830 characters, which makes it a version 23
 * symbol: 109 modules across, where an ordinary "visit our site" code is about 30. At that
 * density `jsQR` reads a crisp code held at exactly the right distance and fails on a
 * pixel of blur — which is to say it fails on a photograph taken by a hand. This one read
 * the same code at four sizes and through a pixel of blur. The megabyte is what the
 * difference between "reads my receipt" and "sometimes reads my receipt" costs.
 */

let prepared = false;

async function reader() {
  const mod = await import("zxing-wasm/reader");
  if (!prepared) {
    mod.prepareZXingModule({
      overrides: {
        /*
          Served by this app, not by a CDN.

          The library fetches its own binary from jsDelivr by default, which makes a
          scanner that stops working when somebody else's network does — and sends a
          request to a third party every time a receipt is scanned. `scripts/copy-zxing.mjs`
          puts the binary that matches the installed version into `public/` before every
          dev run and every build, so this path always exists and always matches.
        */
        locateFile: (path: string, prefix: string) =>
          path.endsWith(".wasm") ? "/zxing_reader.wasm" : `${prefix}${path}`,
      },
    });
    prepared = true;
  }
  return mod;
}

/**
 * Start fetching the decoder without waiting for it.
 *
 * Called when the scan button appears, so that the second between pressing it and the
 * camera opening is spent on the download rather than after it.
 */
export function warmQrReader(): void {
  void reader().catch(() => {
    /* An eager fetch that fails is not an error; the real attempt will report it. */
  });
}

/**
 * A picture, as pixels the decoder can work on.
 *
 * Handing the decoder the file itself is the obvious thing and it is the wrong thing. The
 * decoder brings its own small image reader, which knows JPEG and PNG and nothing else —
 * so a photograph straight off a phone, which is as likely as not HEIC, made it throw
 * rather than fail to find a code, and the panel said "I could not read the picture"
 * without saying why. The browser has already solved this: `createImageBitmap` decodes
 * whatever the browser itself can display.
 *
 * The cap is high on purpose. A photograph of a whole receipt has the code taking up maybe
 * a fifth of the frame, and a version 23 symbol is 109 modules across — scale a 4000px
 * photo down to 1600 and those modules land at under three pixels each, which is under
 * what anything can read. Three thousand keeps a phone photograph essentially intact and
 * still refuses to build a hundred-megabyte buffer out of something larger.
 */
export async function pixelsOf(source: Blob, max = 3000): Promise<ImageData> {
  const bitmap = await createImageBitmap(source);
  try {
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("canvas unavailable");
    ctx.drawImage(bitmap, 0, 0, w, h);
    return ctx.getImageData(0, 0, w, h);
  } finally {
    // The decoded picture is let go the moment its pixels have been copied.
    bitmap.close();
  }
}

/**
 * The text inside the first QR code in this picture, or nothing.
 *
 * Takes what the caller already has — a frame lifted off a video, or a photograph as a
 * file — and hands back a string. Nothing is uploaded, nothing is written down: the
 * picture exists as pixels for as long as this call takes and is then let go.
 */
export async function readQrCode(source: ImageData | Blob): Promise<string | null> {
  const { readBarcodes } = await reader();
  // A file is turned into pixels by the browser first; see `pixelsOf` for why.
  const pixels = source instanceof Blob ? await pixelsOf(source) : source;
  const found = await readBarcodes(pixels, {
    formats: ["QRCode"],
    /*
      Worth the milliseconds. `tryHarder` is what lets the decoder rotate, deskew and
      re-threshold a code that is at an angle on a curling piece of paper, which is the
      state every receipt is in.
    */
    tryHarder: true,
    maxNumberOfSymbols: 1,
  });

  const text = found[0]?.text?.trim();
  return text ? text : null;
}
