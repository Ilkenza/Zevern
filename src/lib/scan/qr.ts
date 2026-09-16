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
 * The text inside the first QR code in this picture, or nothing.
 *
 * Takes what the caller already has — a frame lifted off a video, or a photograph as a
 * file — and hands back a string. Nothing is uploaded, nothing is written down: the
 * picture exists as pixels for as long as this call takes and is then let go.
 */
export async function readQrCode(source: ImageData | Blob): Promise<string | null> {
  const { readBarcodes } = await reader();
  const found = await readBarcodes(source, {
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
