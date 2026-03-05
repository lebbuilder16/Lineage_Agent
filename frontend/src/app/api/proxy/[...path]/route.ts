/**
 * Next.js catch-all API proxy — forwards requests to the FastAPI backend.
 *
 * Why this exists:
 *   In GitHub Codespaces (and many containerised dev environments) the browser
 *   cannot reach `localhost:8000` directly — that address resolves to the
 *   user's own machine, not the running container. By routing all API calls
 *   through `/api/proxy/*` the requests are handled by the Next.js server
 *   process, which *can* reach the backend via `localhost:8000`.
 *
 *   In production (Vercel + Fly.io) the same proxy also avoids CORS preflight
 *   round-trips and keeps the public surface of the backend unexposed.
 *
 * Usage (api.ts):
 *   API_BASE = "/api/proxy"  →  fetch("/api/proxy/compare?…")
 *                                       ↓ (server-side)
 *                            http://localhost:8000/compare?…
 */

import { type NextRequest, NextResponse } from "next/server";

// Server-side env var — NOT exposed to the browser.
// Falls back to the same default as the frontend client code.
const BACKEND_URL =
  process.env.INTERNAL_API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:8000";

// Strip trailing slash so path joining is clean
const BASE = BACKEND_URL.replace(/\/$/, "");

export async function GET(
  req: NextRequest,
  { params }: { params: { path: string[] } },
) {
  return proxyRequest(req, params.path, "GET");
}

export async function POST(
  req: NextRequest,
  { params }: { params: { path: string[] } },
) {
  return proxyRequest(req, params.path, "POST");
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { path: string[] } },
) {
  return proxyRequest(req, params.path, "DELETE");
}

async function proxyRequest(
  req: NextRequest,
  pathSegments: string[],
  method: string,
): Promise<NextResponse> {
  const pathname = "/" + pathSegments.join("/");
  const search = req.nextUrl.searchParams.toString();
  const targetUrl = `${BASE}${pathname}${search ? `?${search}` : ""}`;

  // ── LOG: show exactly which URL the proxy is forwarding to ──────────────
  console.log(`[proxy] ${method} ${targetUrl}  (BACKEND_URL="${BASE}")`);

  const headers = new Headers();
  // Forward relevant headers
  const contentType = req.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  const accept = req.headers.get("accept");
  if (accept) headers.set("accept", accept);

  let body: BodyInit | undefined;
  if (method !== "GET" && method !== "DELETE") {
    body = await req.text();
  }

  try {
    const upstream = await fetch(targetUrl, {
      method,
      headers,
      body,
    });

    // ── LOG: upstream HTTP status ─────────────────────────────────────────
    console.log(`[proxy] ← ${upstream.status} ${upstream.statusText}  (${targetUrl})`);

    const rawBody = await upstream.text();

    if (!upstream.ok) {
      // ── LOG: non-2xx — dump the body so we can see the error detail ─────
      console.error(`[proxy] upstream error body (${upstream.status}):`, rawBody);
    }

    return new NextResponse(rawBody, {
      status: upstream.status,
      headers: {
        "content-type": upstream.headers.get("content-type") ?? "application/json",
      },
    });
  } catch (err) {
    // ── LOG: network-level error (connection refused, DNS failure, …) ──────
    console.error("[proxy] NETWORK ERROR reaching backend:", targetUrl);
    console.error("[proxy] error details:", err);
    return NextResponse.json(
      {
        detail:
          `Backend unreachable at ${BASE} — make sure the API server is running. ` +
          `(${err instanceof Error ? err.message : String(err)})`,
      },
      { status: 502 },
    );
  }
}
