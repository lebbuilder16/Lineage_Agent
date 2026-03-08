/**
 * Unit tests for src/lib/websocket.ts
 * Verifies that liveAlerts.start() creates a WebSocket and that valid messages
 * are forwarded to the alerts store.
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

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  close() {
    this.readyState = WebSocket.CLOSED;
    this.onclose?.({});
  }

  triggerOpen() {
    this.readyState = WebSocket.OPEN;
    this.onopen?.({});
  }

  triggerMessage(data: object) {
    this.onmessage?.({ data: JSON.stringify(data) });
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

  it("connects to the /ws/lineage endpoint", () => {
    liveAlerts.start();
    expect(MockWebSocket.instances[0].url).toContain("/ws/lineage");
  });
});

describe("liveAlerts message handling", () => {
  it("adds a valid alert to the store", () => {
    liveAlerts.start();
    const ws = MockWebSocket.instances[0];
    ws.triggerOpen();
    ws.triggerMessage({
      id: "alert-ws-1",
      type: "rug",
      mint: "mint_aaa",
      token_name: "RUGTOKEN",
      token_image: "",
      message: "Rug detected via WS",
      timestamp: new Date().toISOString(),
    });
    expect(useAlertsStore.getState().alerts).toHaveLength(1);
    expect(useAlertsStore.getState().alerts[0].id).toBe("alert-ws-1");
  });

  it("ignores malformed JSON messages", () => {
    liveAlerts.start();
    const ws = MockWebSocket.instances[0];
    ws.triggerOpen();
    ws.onmessage?.({ data: "not-json{{" });
    expect(useAlertsStore.getState().alerts).toHaveLength(0);
  });

  it("ignores messages missing required fields", () => {
    liveAlerts.start();
    const ws = MockWebSocket.instances[0];
    ws.triggerOpen();
    ws.triggerMessage({ type: "rug" }); // missing id and mint
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
