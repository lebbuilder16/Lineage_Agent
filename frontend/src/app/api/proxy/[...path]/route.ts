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
      // Node.js fetch doesn't need a signal for typical req/res
    });

    const data = await upstream.arrayBuffer();
    return new NextResponse(data, {
      status: upstream.status,
      headers: {
        "content-type": upstream.headers.get("content-type") ?? "application/json",
      },
    });
  } catch (err) {
    console.error("[proxy] upstream error:", targetUrl, err);
    return NextResponse.json(
      { detail: "Backend unreachable — make sure the API server is running." },
      { status: 502 },
    );
  }
}
