"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Camera, Image as ImageIcon, Link2, ScanLine, X } from "lucide-react";
import { buttonClasses } from "@/components/ui/Button";
import { readQrCode, warmQrReader } from "@/lib/scan/qr";
import { scanReceipt } from "@/app/(app)/private/actions/receipts";
import type { ScannedReceipt } from "@/lib/money/receipt";

/** SSR-safe "are we in the browser yet", without a setState in an effect. */
const subscribeToNothing = () => () => {};

/**
 * Why the camera did not open, in a sentence somebody can act on.
 *
 * `NotAllowedError` covers two situations that need opposite things done about them, and
 * telling them apart is the whole value of this function. If the browser has never been
 * asked, the answer is to press the button again and say yes. If it was asked once and
 * told no, the browser will never ask again — it throws the same error instantly, forever,
 * and no amount of pressing the button will produce a prompt. That second case is what
 * "it says allow it but it never asks me" is, and the only way out of it is the site
 * settings behind the icon in the address bar.
 */
async function whyNot(err: unknown): Promise<string> {
  const name = err instanceof Error ? err.name : "";

  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "Ne vidim nijednu kameru na ovom uređaju. Slikaj račun ili nalepi link.";
  }

  if (name === "NotReadableError") {
    return "Kameru već koristi neki drugi program. Zatvori ga pa probaj ponovo.";
  }

  if (name === "NotAllowedError" || name === "SecurityError") {
    let state: string | null = null;
    try {
      // Not in the TypeScript permission list, and supported everywhere that matters.
      const status = await navigator.permissions.query({ name: "camera" as PermissionName });
      state = status.state;
    } catch {
      /* Some browsers do not answer for the camera; the general message covers it. */
    }

    if (state === "denied") {
      /*
        The operating system first, and the browser second — which is the opposite of the
        order this was written in, and of the order anybody guesses.

        Two wrong versions came before this one. The first said "click the icon next to
        the address", and there was no camera row behind that icon. The second blamed the
        browser's own default, and a screenshot showed that default set to "sites can ask"
        with no site overridden either way — while the camera was still refused instantly,
        with no prompt, on two different origins.

        What is left is the layer underneath: on macOS an app has to be granted the camera
        by the system before anything inside it can ask for one, and when it has not been,
        the browser reports the permission as denied and refuses in a millisecond. It looks
        exactly like a site being blocked, which is why it costs an hour to find. So it is
        named first now, and the browser's own page second.
      */
      return `Kamera je odbijena pre nego što je pregledač uopšte stigao da pita. Prvo proveri sistem: Podešavanja → Privatnost i bezbednost → Kamera, uključi pregledač i zatvori ga pa otvori ponovo. Ako je tamo već uključen, nalepi ${settingsPath()} u adresu i dozvoli sajtovima da traže kameru.`;
    }
    return "Nisi dozvolio kameru. Klikni Kamera ponovo i izaberi Dozvoli.";
  }

  return "Kamera se ne otvara ovde. Slikaj račun ili nalepi link.";
}

/** Where the camera switch lives, named for the browser that is asking. */
function settingsPath(): string {
  const nav = navigator as Navigator & { brave?: unknown };
  if (nav.brave) return "brave://settings/content/camera";

  const brands = (navigator as Navigator & { userAgentData?: { brands?: { brand: string }[] } })
    .userAgentData?.brands?.map((b) => b.brand)
    .join(" ") ?? navigator.userAgent;

  if (/Edg/i.test(brands)) return "edge://settings/content/camera";
  if (/Opera|OPR/i.test(brands)) return "opera://settings/content/camera";
  if (/Chrome|Chromium/i.test(brands)) return "chrome://settings/content/camera";
  // Safari and Firefox keep it in their own preferences rather than at an address.
  return "podešavanja pregledača → Kamera";
}

/**
 * The camera, pointed at the QR on a fiscal receipt.
 *
 * What this is for: not having to type what was in the bag. Every receipt printed in
 * Serbia since 2022 carries a code that the tax service will expand into the shop, the
 * time, the total and every line with its count and its price — so the paper can become
 * words in the entry without anybody reading it out.
 *
 * What it deliberately is not: a place pictures go. The frames it looks at live in a
 * canvas for as long as one decode takes and are then dropped; the stream is stopped the
 * moment a code is found or the panel is closed; and nothing — not a frame, not a
 * photograph, not a thumbnail — is uploaded or saved. Only the text of the receipt ever
 * reaches the server, and only the text is stored. That was the whole request, and it is
 * the one promise the component has to keep even when it would be convenient not to.
 *
 * Three ways in, because one is never enough: the camera, a photograph for the phone that
 * will not open one, and a pasted address for the desktop that has none. All three end at
 * the same place — a string that `scanReceipt` refuses unless it points at the tax
 * service, and which fills the form the person is already looking at.
 */
export function ReceiptScan({
  onRead,
}: {
  /** Called with a receipt the server has already read and checked. */
  onRead: (receipt: ScannedReceipt, seenOn: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pasted, setPasted] = useState("");
  const [camera, setCamera] = useState<"starting" | "live" | "off">("off");
  /* What the camera is actually giving, so a failure to read is not also a mystery. */
  const [feed, setFeed] = useState<string | null>(null);

  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<number | null>(null);
  /* One decode at a time: the loop must never run ahead of the decoder. */
  const reading = useRef(false);
  /* Set the instant a code is found, so a frame already in flight cannot fire twice. */
  const done = useRef(false);
  /* How many frames have been looked at, so silence can be told from stillness. */
  const looked = useRef(0);

  /*
    Are we in the browser yet — asked without a state change in an effect, the same way
    `SlideOver` asks it. The overlay is portalled into `document.body`, which does not
    exist while the page is being rendered on the server.
  */
  const mounted = useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );

  /** Everything the camera is holding, let go. Safe to call twice. */
  const stop = useCallback(() => {
    if (timer.current !== null) {
      window.clearInterval(timer.current);
      timer.current = null;
    }
    for (const track of stream.current?.getTracks() ?? []) track.stop();
    stream.current = null;
    if (video.current) video.current.srcObject = null;
    setCamera("off");
    setFeed(null);
  }, []);

  /* The camera must not survive the panel, a route change, or a tab being closed. */
  useEffect(() => stop, [stop]);

  /**
   * A string that came off a code, taken to the server and turned into a receipt.
   *
   * Whatever found it — camera, photograph, clipboard — this is the only path onwards,
   * so the refusals and the duplicate warning read the same however the person scanned.
   */
  const submit = useCallback(
    async (text: string) => {
      done.current = true;
      stop();
      setBusy(true);
      setError(null);
      setNote("Čitam račun…");

      const state = await scanReceipt(text);
      setBusy(false);

      if (!state.ok) {
        setNote(null);
        setError(state.error);
        done.current = false;
        return;
      }

      onRead(state.receipt, state.seenOn);
      setOpen(false);
      setNote(null);
    },
    [onRead, stop],
  );

  /** One frame off the video, looked at, and let go. */
  const sweep = useCallback(async () => {
    if (reading.current || done.current) return;
    const el = video.current;
    if (!el || el.readyState < 2 || !el.videoWidth) return;

    reading.current = true;
    try {
      /*
        The middle of the sensor, at the sensor's own resolution — not the whole frame
        shrunk to fit.

        This is the difference between reading a fiscal receipt and not. The code is 109
        modules across, and nothing decodes one below about three pixels a module, so the
        only number that matters is how many pixels land on the code itself. Scaling the
        whole frame down threw away a fifth of them for no reason; cropping the square the
        viewfinder is already asking him to aim with keeps every one, and throws away only
        the parts of the picture the code was never in.

        The cap is a memory limit, not a quality one: it only engages on a camera giving
        more than sixteen hundred pixels down the short side, and then it is still more
        than a dense code needs.
      */
      const side = Math.min(el.videoWidth, el.videoHeight);
      const out = Math.min(side, 1600);
      const sx = Math.round((el.videoWidth - side) / 2);
      const sy = Math.round((el.videoHeight - side) / 2);

      const canvas = document.createElement("canvas");
      canvas.width = out;
      canvas.height = out;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(el, sx, sy, side, side, 0, 0, out, out);

      const found = await readQrCode(ctx.getImageData(0, 0, out, out));
      looked.current++;
      if (found && !done.current) return void (await submit(found));

      /*
        After about seven seconds of looking, say so.

        Silence is the wrong answer here, because the commonest reason this finds nothing
        is not a shaky hand — it is a camera that cannot resolve the code at all. A fiscal
        QR is 109 modules across, and measured against this decoder it needs roughly two
        hundred pixels when the picture is perfectly sharp and four hundred once there is
        any softness in it. A laptop's webcam is fixed-focus at about half a metre, where a
        two-centimetre code lands on about seventy pixels — so no amount of holding it
        steadier will ever work, and a panel that just keeps staring implies it might.
      */
      if (looked.current === 45 && !done.current) {
        setNote("Ne nalazim kod. Priđi bliže — a ako je ovo laptop kamera, ona je za ovako gust kod najčešće preslaba: uslikaj telefonom ili nalepi link.");
      }
    } catch (err) {
      /*
        A frame that will not decode is the ordinary case. A decoder that will not load is
        not, and swallowing both left the panel staring silently at a working camera with
        no way to tell the two apart. The first failure is reported; the rest are frames.
      */
      if (looked.current === 0) {
        setError(`Čitač se ne učitava: ${err instanceof Error ? err.message : String(err)}`);
      }
      looked.current++;
    } finally {
      reading.current = false;
    }
  }, [submit]);

  /** Ask for the camera and start looking. */
  const start = useCallback(async () => {
    setError(null);
    done.current = false;

    /*
      A browser only ever offers the camera on a secure origin, and `localhost` counts as
      one — so this is the phone opening the dev server over the network, where there is
      nothing to allow and no prompt to wait for. Saying "allow it" there sends somebody
      hunting through settings for a switch that does not exist.
    */
    if (!window.isSecureContext) {
      setError("Kamera radi samo preko HTTPS. Otvori aplikaciju na zevern.vercel.app, ili slikaj račun.");
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Ovaj pregledač ne daje kameru — slikaj račun ili nalepi link.");
      return;
    }

    setCamera("starting");
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        /*
          The back camera, and every pixel it will give. `ideal` rather than `min`, so a
          camera that cannot manage this still opens at whatever it has — but a phone that
          can shoot four thousand pixels across should not be handed a 720p stream for a
          code that needs the detail.
        */
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 2560 },
          height: { ideal: 1440 },
        },
        audio: false,
      });
      stream.current = media;
      if (video.current) {
        video.current.srcObject = media;
        await video.current.play().catch(() => {});
      }
      const track = media.getVideoTracks()[0];
      const shot = track?.getSettings?.();
      /*
        Printed, because it is the number that decides whether this can work at all. A
        laptop's webcam is fixed-focus at about half a metre: hold a receipt where it can
        focus and the code is a hundred pixels across, which is one pixel per module and
        unreadable by anything. Seeing `1280×720` on screen is what turns "it just does
        not work" into "this camera cannot, the phone can".
      */
      if (shot?.width && shot?.height) setFeed(`${shot.width}×${shot.height}`);

      looked.current = 0;
      setCamera("live");
      setNote("Drži QR sa računa u okviru.");
      timer.current = window.setInterval(() => void sweep(), 160);
    } catch (err) {
      setCamera("off");
      setError(await whyNot(err));
    }
  }, [sweep]);

  const openScanner = () => {
    setOpen(true);
    setError(null);
    setNote(null);
    setPasted("");
    void start();
  };

  const close = () => {
    stop();
    setOpen(false);
    setError(null);
    setNote(null);
    setBusy(false);
    done.current = false;
  };

  /** A photograph, for the camera that will not open in a browser. */
  const fromPhoto = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setNote("Gledam sliku…");
    try {
      const found = await readQrCode(file);
      if (!found) {
        setNote(null);
        setError("Na slici nema QR koda koji mogu da pročitam. Uslikaj bliže, tako da kod bude krupan i ceo u kadru.");
        return;
      }
      await submit(found);
    } catch (err) {
      setNote(null);
      /*
        The real reason, not a shrug. This used to say only "I could not read the picture",
        which is the same sentence for a format the browser cannot open, a file that is not
        an image at all, and a decoder that failed to load — three different things to do
        about it, and no way to tell which one you were looking at.
      */
      const why = err instanceof Error ? err.message : String(err);
      setError(
        /image|decode|source|bitmap/i.test(why)
          ? "Ovaj format slike pregledač ne ume da otvori (HEIC?). Sačuvaj kao JPG ili PNG."
          : `Sliku nisam mogao da pročitam: ${why.slice(0, 120)}`,
      );
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={openScanner}
        onPointerEnter={warmQrReader}
        onFocus={warmQrReader}
        className={buttonClasses("secondary", "w-full")}
      >
        <ScanLine className="h-4 w-4" aria-hidden="true" />
        Skeniraj račun
      </button>

      {open &&
        mounted &&
        createPortal(
          <div className="fixed inset-0 z-[70] flex flex-col bg-black/92" role="dialog" aria-modal="true" aria-label="Skeniranje računa">
            <div className="flex shrink-0 items-center justify-between gap-3 px-5 py-4">
              <div>
                <p className="text-[13.5px] font-semibold text-ink">Skeniraj račun</p>
                {/*
                  Said on the screen, not only in a changelog. The one thing a person
                  wants to know before pointing a camera at their shopping is where the
                  picture goes, and the answer here is nowhere.
                */}
                <p className="text-[11.5px] text-muted">Slika se ne čuva — čita se i briše.</p>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="Zatvori"
                className="rounded-ctrl p-2 text-muted hover:text-ink"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <div className="relative flex-1 overflow-hidden">
              <video
                ref={video}
                playsInline
                muted
                autoPlay
                className="h-full w-full object-cover"
              />
              {/* The frame to aim with. Nothing crops to it; it is there to say "about here". */}
              {camera === "live" && (
                <div className="pointer-events-none absolute inset-0 grid place-items-center">
                  <div className="h-[58vmin] w-[58vmin] max-h-[380px] max-w-[380px] rounded-[18px] border-2 border-gold/70 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
                </div>
              )}
              {camera !== "live" && (
                <div className="absolute inset-0 grid place-items-center px-6 text-center">
                  <p className="text-[13px] text-muted">
                    {camera === "starting" ? "Otvaram kameru…" : "Kamera nije uključena."}
                  </p>
                </div>
              )}
            </div>

            <div className="shrink-0 space-y-3 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4">
              {note && (
                <p className="text-center text-[12.5px] text-muted">
                  {note}
                  {feed && <span className="mono text-faint"> · {feed}</span>}
                </p>
              )}
              {error && (
                <p className="rounded-ctrl border border-danger/40 bg-danger/10 px-3 py-2 text-center text-[12.5px] text-ink">
                  {error}
                </p>
              )}

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => void start()}
                  disabled={busy || camera === "starting"}
                  className={buttonClasses("secondary")}
                >
                  <Camera className="h-4 w-4" aria-hidden="true" />
                  {camera === "live" ? "Ponovo" : "Kamera"}
                </button>

                <label className={buttonClasses("secondary", "cursor-pointer")}>
                  <ImageIcon className="h-4 w-4" aria-hidden="true" />
                  Slikaj
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="sr-only"
                    onChange={(e) => {
                      void fromPhoto(e.target.files?.[0]);
                      // So the same picture can be chosen twice after a failure.
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>

              {/*
                The desktop's way in. There is no camera on the machine this app is mostly
                built on, and the phone's own camera app already turns the code into a link
                that can be sent anywhere — including here.
              */}
              <div className="flex gap-2">
                <input
                  value={pasted}
                  onChange={(e) => setPasted(e.target.value)}
                  placeholder="ili nalepi link sa računa"
                  inputMode="url"
                  autoComplete="off"
                  className="zv-field min-w-0 flex-1 rounded-ctrl border border-line bg-white/[0.035] px-3 py-2.5 text-[13px] text-ink placeholder:text-faint focus:border-gold focus:shadow-ring focus:outline-none"
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    if (pasted.trim()) void submit(pasted.trim());
                  }}
                />
                <button
                  type="button"
                  disabled={busy || !pasted.trim()}
                  onClick={() => void submit(pasted.trim())}
                  className={buttonClasses("ghost")}
                >
                  <Link2 className="h-4 w-4" aria-hidden="true" />
                  Učitaj
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
