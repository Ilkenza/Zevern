import { ImageResponse } from "next/og";

/**
 * The card that shows when the address is pasted into a message.
 *
 * Generated rather than drawn so it cannot drift from the app: the colours are the
 * same six tokens the interface uses, and the sentence is the one on the landing
 * page. It is rendered once at build time — there is nothing per-request in it.
 */
export const alt = "Zevern — everything between finding a client and getting paid, in one place.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#0c0e12",
          padding: "72px",
          // The gold glow the sign-in page has, flattened into a gradient because a
          // 120px blur is not something a static rasteriser should be asked to do.
          backgroundImage:
            "radial-gradient(900px 500px at 22% 18%, rgba(217,164,65,0.16), transparent 65%)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div
            style={{
              width: "44px",
              height: "44px",
              borderRadius: "12px",
              background: "#d9a441",
              color: "#1b1710",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "26px",
              fontWeight: 800,
            }}
          >
            Z
          </div>
          <div style={{ fontSize: "30px", fontWeight: 700, color: "#eceef2", letterSpacing: "-0.5px" }}>
            Zevern
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontSize: "62px",
              fontWeight: 800,
              color: "#eceef2",
              lineHeight: 1.08,
              letterSpacing: "-2px",
              maxWidth: "980px",
            }}
          >
            Everything between finding a client and getting paid, in one place.
          </div>
          <div
            style={{
              marginTop: "28px",
              fontSize: "27px",
              color: "#8a909e",
              lineHeight: 1.45,
              maxWidth: "900px",
            }}
          >
            Leads, quotes, projects, invoices, clients, tasks, an SEO check and your
            toolbox — for one person working alone.
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <div style={{ width: "48px", height: "3px", background: "#d9a441" }} />
          <div style={{ fontSize: "22px", color: "#565c6b" }}>
            {"// one workspace, one person"}
          </div>
        </div>
      </div>
    ),
    size,
  );
}
