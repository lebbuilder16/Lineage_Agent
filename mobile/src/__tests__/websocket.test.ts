/**
 * Unit tests for src/lib/websocket.ts
 * Verifies that liveAlerts.start() creates a WebSocket and that valid messages
 * are forwarded to the alerts store.
 *
 * Root-cause analysis for codespace disconnections
 * ─────────────────────────────────────────────────
 * The WebSocket was connecting to /ws/lineage (single-shot analysis endpoint)
 * instead of /ws/alerts (persistent alert-stream endpoint).  The server blocks
 * on receive_json() waiting for a {"mint":"..."} message that the mobile client
 * never sends, so no data ever flows and proxy idle-timeout teardowns happen
 * within ~60 s.  In addition, neither client sent keepalive pings, which the
 * server documentation explicitly requires to survive proxies like Fly.io.
 *
 * Fixes verified by these tests:
 *  1. liveAlerts connects to /ws/alerts (not /ws/lineage)
 *  2. liveAlerts sends a "ping" frame after the keepalive interval elapses
 *  3. Incoming server alerts are mapped to AlertItem and stored
 */

import { useAlertsStore } from "@/src/store/alerts";

// Mock WebSocket globally before the module is loaded
type WSHandler = (event: any) => void;

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  readyState: number = WebSocket.CONNECTING;
  onopen: WSHandler | null = null;
  onmessage: WSHandler | null = null;
  onerror: WSHandler | null = null;
  onclose: WSHandler | null = null;
  url: string;
  sent: string[] = [];

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.readyState = WebSocket.CLOSED;
    this.onclose?.({});
  }

  triggerOpen() {
    this.readyState = WebSocket.OPEN;
    this.onopen?.({});
  }

  triggerMessage(data: object | string) {
    const payload = typeof data === "string" ? data : JSON.stringify(data);
    this.onmessage?.({ data: payload });
  }
}

(globalThis as any).WebSocket = MockWebSocket;

// Import liveAlerts AFTER WebSocket mock is in place
import { liveAlerts } from "@/src/lib/websocket";

beforeEach(() => {
  MockWebSocket.instances = [];
  useAlertsStore.setState({ alerts: [], unreadCount: 0 });
  liveAlerts.stop(); // reset internal state
  jest.useFakeTimers();
});

afterEach(() => {
  liveAlerts.stop();
  jest.useRealTimers();
});

describe("liveAlerts.start()", () => {
  it("creates a WebSocket connection", () => {
    liveAlerts.start();
    expect(MockWebSocket.instances).toHaveLength(1);
  });

  it("connects to the /ws/alerts endpoint (not /ws/lineage)", () => {
    liveAlerts.start();
    expect(MockWebSocket.instances[0].url).toContain("/ws/alerts");
  });
});

describe("liveAlerts keepalive pings — root cause of disconnections", () => {
  it("sends a ping frame after the keepalive interval (30 s)", () => {
    liveAlerts.start();
    const ws = MockWebSocket.instances[0];
    ws.triggerOpen();

    // No ping yet before the interval fires
    expect(ws.sent).toHaveLength(0);

    // Advance fake timers by 30 s to trigger the ping interval
    jest.advanceTimersByTime(30_000);

    expect(ws.sent).toContain("ping");
  });

  it("sends multiple pings over time", () => {
    liveAlerts.start();
    const ws = MockWebSocket.instances[0];
    ws.triggerOpen();

    jest.advanceTimersByTime(90_000); // 3 × 30 s intervals

    const pings = ws.sent.filter((m) => m === "ping");
    expect(pings.length).toBeGreaterThanOrEqual(3);
  });

  it("does not send pings before the socket is opened", () => {
    liveAlerts.start();
    const ws = MockWebSocket.instances[0];
    // Do NOT call triggerOpen — socket stays in CONNECTING state

    jest.advanceTimersByTime(30_000);

    expect(ws.sent).toHaveLength(0);
  });

  it("stops sending pings after stop() is called", () => {
    liveAlerts.start();
    const ws = MockWebSocket.instances[0];
    ws.triggerOpen();

    liveAlerts.stop();
    const sentBeforeStop = ws.sent.length;

    jest.advanceTimersByTime(30_000);

    expect(ws.sent.length).toBe(sentBeforeStop);
  });
});

describe("liveAlerts message handling", () => {
  it("adds a server-format alert to the store", () => {
    liveAlerts.start();
    const ws = MockWebSocket.instances[0];
    ws.triggerOpen();
    ws.triggerMessage({
      event: "alert",
      type: "deployer",
      title: "Deployer Alert: TOKEN",
      body: "Watched deployer launched TOKEN",
      mint: "mint_aaa",
    });
    const alerts = useAlertsStore.getState().alerts;
    expect(alerts).toHaveLength(1);
    expect(alerts[0].mint).toBe("mint_aaa");
    expect(alerts[0].token_name).toBe("Deployer Alert: TOKEN");
    expect(alerts[0].message).toBe("Watched deployer launched TOKEN");
  });

  it("ignores malformed JSON messages", () => {
    liveAlerts.start();
    const ws = MockWebSocket.instances[0];
    ws.triggerOpen();
    ws.onmessage?.({ data: "not-json{{" });
    expect(useAlertsStore.getState().alerts).toHaveLength(0);
  });

  it("ignores messages missing the mint field", () => {
    liveAlerts.start();
    const ws = MockWebSocket.instances[0];
    ws.triggerOpen();
    ws.triggerMessage({ event: "alert", type: "deployer", title: "No mint here" });
    expect(useAlertsStore.getState().alerts).toHaveLength(0);
  });

  it("ignores server pong text responses", () => {
    liveAlerts.start();
    const ws = MockWebSocket.instances[0];
    ws.triggerOpen();
    // The server sends plain text "pong", not JSON — triggerMessage with raw string
    ws.onmessage?.({ data: "pong" });
    expect(useAlertsStore.getState().alerts).toHaveLength(0);
  });
});

describe("liveAlerts.stop()", () => {
  it("closes the WebSocket", () => {
    liveAlerts.start();
    const ws = MockWebSocket.instances[0];
    ws.triggerOpen();
    liveAlerts.stop();
    expect(ws.readyState).toBe(WebSocket.CLOSED);
  });
});
