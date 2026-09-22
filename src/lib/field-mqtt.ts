import { useCallback, useEffect, useRef, useState } from "react";
import mqtt, { type MqttClient } from "mqtt";

export const TOPICS = {
  stage1Line: "field/stage1/line",
  stage2Line: "field/stage2/line",
  stageSwitch: "field/stage/switch",
  status: "field/status",
} as const;

export const DEFAULT_BROKER = "wss://test.mosquitto.org:8081";
export const START_MARKS = 100;
export const FAULT_PENALTY = 5;

export type EventKind = "fault" | "switch" | "info";

export type FieldEvent = {
  id: string;
  at: number;
  topic: string;
  message: string;
  kind: EventKind;
};

export type FieldState = {
  activeStage: 1 | 2;
  stage1Fault: boolean;
  stage2Fault: boolean;
  marks: number;
  faults: number;
  events: FieldEvent[];
};

const initialState: FieldState = {
  activeStage: 1,
  stage1Fault: false,
  stage2Fault: false,
  marks: START_MARKS,
  faults: 0,
  events: [],
};

const isHigh = (raw: string) => {
  const v = raw.trim().toLowerCase();
  if (!v) return false;
  try {
    const parsed = JSON.parse(v) as Record<string, unknown>;
    if (typeof parsed === "object" && parsed) {
      const s = String(parsed["state"] ?? parsed["status"] ?? parsed["value"] ?? "").toLowerCase();
      if (s) return ["high", "1", "true", "fault", "active", "on"].includes(s);
    }
  } catch {
    /* plain text payload */
  }
  return !["low", "0", "false", "clear", "off", "free", "idle"].includes(v);
};

export function useFieldMonitor(brokerUrl: string, connectNonce: number) {
  const [state, setState] = useState<FieldState>(initialState);
  const [status, setStatus] = useState<"idle" | "connecting" | "online" | "error">("idle");
  const clientRef = useRef<MqttClient | null>(null);

  const push = useCallback((topic: string, message: string) => {
    setState((prev) => {
      const high = isHigh(message);
      const next: FieldState = { ...prev, events: prev.events };
      let kind: EventKind = "info";

      if (topic === TOPICS.stage1Line || topic === TOPICS.stage2Line) {
        const key = topic === TOPICS.stage1Line ? "stage1Fault" : "stage2Fault";
        const was = prev[key];
        next[key] = high;
        if (high && !was) {
          next.marks = Math.max(0, prev.marks - FAULT_PENALTY);
          next.faults = prev.faults + 1;
          kind = "fault";
        }
      } else if (topic === TOPICS.stageSwitch) {
        if (high) {
          next.activeStage = 2;
          kind = "switch";
        } else {
          next.activeStage = 1;
          kind = "switch";
        }
      }

      next.events = [
        { id: `${Date.now()}-${Math.random()}`, at: Date.now(), topic, message, kind },
        ...prev.events,
      ].slice(0, 60);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!brokerUrl) return;
    setStatus("connecting");
    const client = mqtt.connect(brokerUrl, { reconnectPeriod: 4000, connectTimeout: 8000 });
    clientRef.current = client;

    client.on("connect", () => {
      setStatus("online");
      client.subscribe(Object.values(TOPICS));
    });
    client.on("error", () => setStatus("error"));
    client.on("close", () => setStatus((s) => (s === "error" ? s : "connecting")));
    client.on("message", (topic, payload) => push(topic, payload.toString()));

    return () => {
      client.end(true);
      clientRef.current = null;
    };
  }, [brokerUrl, connectNonce, push]);

  const publish = useCallback(
    (topic: string, message: string) => {
      const client = clientRef.current;
      if (client?.connected) client.publish(topic, message);
      else push(topic, message); // offline simulation
    },
    [push],
  );

  const reset = useCallback(() => setState(initialState), []);

  return { state, status, publish, reset };
}
