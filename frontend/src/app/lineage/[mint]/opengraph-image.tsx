import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Meme Lineage Agent";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OGImage({
  params,
}: {
  params: { mint: string };
}) {
  const { mint } = params;

  // Fetch lineage data for OG image generation
  let tokenName = "Unknown Token";
  let confidence = 0;
  let familySize = 1;
  let rootSymbol = "";

  try {
    const res = await fetch(
      `https://lineage-agent.fly.dev/lineage?mint=${mint}`,
      { cache: "force-cache" }
    );
    if (res.ok) {
      const data = await res.json();
      tokenName = data.root?.name || data.query_token?.name || mint.slice(0, 8);
      rootSymbol = data.root?.symbol || "";
      confidence = Math.round((data.confidence ?? 0) * 100);
      familySize = data.family_size ?? 1;
    }
  } catch {}

  const confidenceColor =
    confidence >= 70 ? "#22c55e" : confidence >= 40 ? "#f59e0b" : "#ef4444";

  return new ImageResponse(
    (
      <div
        style={{
          background: "hsl(224, 71%, 4%)",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px",
          fontFamily: "sans-serif",
        }}
      >
        {/* Top badge */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
          }}
        >
          <div
            style={{
              background: "hsl(213, 94%, 56%)",
              color: "#fff",
              borderRadius: "12px",
              padding: "8px 16px",
              fontSize: "18px",
              fontWeight: 700,
            }}
          >
            LA
          </div>
          <span
            style={{ color: "hsl(215, 20%, 55%)", fontSize: "18px" }}
          >
            Lineage Agent
          </span>
        </div>

        {/* Main content */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={{ color: "hsl(215, 20%, 55%)", fontSize: "18px" }}>
            Token Lineage Analysis
          </div>
          <div
            style={{
              color: "hsl(213, 31%, 91%)",
              fontSize: "56px",
              fontWeight: 800,
              lineHeight: 1.1,
              maxWidth: "750px",
            }}
          >
            {tokenName}
            {rootSymbol ? ` (${rootSymbol})` : ""}
          </div>

          {/* Stats row */}
          <div style={{ display: "flex", gap: "32px", marginTop: "8px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <span style={{ color: "hsl(215, 20%, 55%)", fontSize: "14px" }}>
                CONFIDENCE
              </span>
              <span
                style={{
                  color: confidenceColor,
                  fontSize: "36px",
                  fontWeight: 800,
                }}
              >
                {confidence}%
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <span style={{ color: "hsl(215, 20%, 55%)", fontSize: "14px" }}>
                FAMILY SIZE
              </span>
              <span
                style={{
                  color: "hsl(213, 31%, 91%)",
                  fontSize: "36px",
                  fontWeight: 800,
                }}
              >
                {familySize}
              </span>
            </div>
          </div>
        </div>

        {/* Bottom */}
        <div
          style={{
            color: "hsl(215, 20%, 40%)",
            fontSize: "14px",
            fontFamily: "monospace",
          }}
        >
          {mint}
        </div>
      </div>
    ),
    { ...size }
  );
}
