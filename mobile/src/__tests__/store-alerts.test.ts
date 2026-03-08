/**
 * Unit tests for the Zustand alerts store.
 * Covers addAlert, markRead, markAllRead, clearAll, and the 100-item cap.
 */

import { useAlertsStore } from "@/src/store/alerts";
import type { AlertItem } from "@/src/types/api";

function makeAlert(overrides: Partial<AlertItem> = {}): AlertItem {
  return {
    id: overrides.id ?? "alert-1",
    type: "rug",
    mint: "mint123",
    token_name: "PEPE",
    token_image: "",
    message: "Rug detected",
    timestamp: new Date().toISOString(),
    read: false,
    ...overrides,
  };
}

beforeEach(() => {
  useAlertsStore.setState({ alerts: [], unreadCount: 0 });
});

describe("alerts store — initial state", () => {
  it("starts with empty alerts", () => {
    expect(useAlertsStore.getState().alerts).toHaveLength(0);
  });

  it("starts with 0 unread count", () => {
    expect(useAlertsStore.getState().unreadCount).toBe(0);
  });
});

describe("alerts store — addAlert", () => {
  it("increments unreadCount", () => {
    useAlertsStore.getState().addAlert(makeAlert());
    expect(useAlertsStore.getState().unreadCount).toBe(1);
  });

  it("prepends the alert (newest first)", () => {
    useAlertsStore.getState().addAlert(makeAlert({ id: "first" }));
    useAlertsStore.getState().addAlert(makeAlert({ id: "second" }));
    expect(useAlertsStore.getState().alerts[0].id).toBe("second");
  });

  it("caps the list at 100 items", () => {
    for (let i = 0; i < 105; i++) {
      useAlertsStore.getState().addAlert(makeAlert({ id: `a${i}` }));
    }
    expect(useAlertsStore.getState().alerts).toHaveLength(100);
  });
});

describe("alerts store — markRead", () => {
  it("marks a single alert as read", () => {
    useAlertsStore.getState().addAlert(makeAlert({ id: "x" }));
    useAlertsStore.getState().markRead("x");
    const alert = useAlertsStore.getState().alerts.find((a) => a.id === "x");
    expect(alert?.read).toBe(true);
  });

  it("decrements unreadCount", () => {
    useAlertsStore.getState().addAlert(makeAlert({ id: "y" }));
    useAlertsStore.getState().markRead("y");
    expect(useAlertsStore.getState().unreadCount).toBe(0);
  });

  it("does not affect other alerts", () => {
    useAlertsStore.getState().addAlert(makeAlert({ id: "a" }));
    useAlertsStore.getState().addAlert(makeAlert({ id: "b" }));
    useAlertsStore.getState().markRead("a");
    const b = useAlertsStore.getState().alerts.find((al) => al.id === "b");
    expect(b?.read).toBe(false);
  });
});

describe("alerts store — markAllRead", () => {
  it("sets all alerts to read", () => {
    useAlertsStore.getState().addAlert(makeAlert({ id: "1" }));
    useAlertsStore.getState().addAlert(makeAlert({ id: "2" }));
    useAlertsStore.getState().markAllRead();
    const allRead = useAlertsStore
      .getState()
      .alerts.every((a) => a.read === true);
    expect(allRead).toBe(true);
  });

  it("resets unreadCount to 0", () => {
    useAlertsStore.getState().addAlert(makeAlert({ id: "1" }));
    useAlertsStore.getState().addAlert(makeAlert({ id: "2" }));
    useAlertsStore.getState().markAllRead();
    expect(useAlertsStore.getState().unreadCount).toBe(0);
  });
});

describe("alerts store — clearAll", () => {
  it("removes all alerts", () => {
    useAlertsStore.getState().addAlert(makeAlert());
    useAlertsStore.getState().clearAll();
    expect(useAlertsStore.getState().alerts).toHaveLength(0);
  });

  it("resets unreadCount to 0", () => {
    useAlertsStore.getState().addAlert(makeAlert());
    useAlertsStore.getState().clearAll();
    expect(useAlertsStore.getState().unreadCount).toBe(0);
  });
});
