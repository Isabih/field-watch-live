import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

/** Fixed topics — identical in ESP32 firmware, backend and frontend. Payload is always "1". */
export const TOPICS = {
  stage: "bike/stage_switching",
  line: "bike/line_violation",
} as const;

export const DEFAULT_BACKEND = "http://localhost:8000";
export const START_MARKS = 100;
export const FAULT_PENALTY = 1;
export const FLASH_MS = 1000;

export type EventKind = "fault" | "switch" | "info";
export type FieldEvent = { id: string; at: number; topic: string; message: string; kind: EventKind; stage: 1 | 2; device?: string };

export type FieldState = {
  activeStage: 1 | 2;
  marks: number;
  faults: number;
  stage1Faults: number;
  stage2Faults: number;
  lastLineAt: number | null;
  lastStageAt: number | null;
  mqttConnected: boolean;
  mqttHost: string;
  mqttPort: number;
  events: FieldEvent[];
};

export const initialState: FieldState = {
  activeStage: 1,
  marks: START_MARKS,
  faults: 0,
  stage1Faults: 0,
  stage2Faults: 0,
  lastLineAt: null,
  lastStageAt: null,
  mqttConnected: false,
  mqttHost: "",
  mqttPort: 1884,
  events: [],
};

export type LinkStatus = "connecting" | "online" | "offline";

/** Same rules the backend applies — used only for offline demo mode. */
function applyLocal(prev: FieldState, topic: string): FieldState {
  const at = Date.now();
  const id = `${at}-${Math.floor(performance.now())}`;
  if (topic === TOPICS.line) {
    const s = prev.activeStage;
    return {
      ...prev,
      marks: Math.max(0, prev.marks - FAULT_PENALTY),
      faults: prev.faults + 1,
      stage1Faults: prev.stage1Faults + (s === 1 ? 1 : 0),
      stage2Faults: prev.stage2Faults + (s === 2 ? 1 : 0),
      lastLineAt: at,
      events: [{ id, at, topic, message: `Line violation in stage ${s} · -${FAULT_PENALTY} marks`, kind: "fault" as const, stage: s }, ...prev.events].slice(0, 100),
    };
  }
  const msg = prev.activeStage === 1 ? "Stage 1 ended · Stage 2 active" : "Object detected · already in stage 2";
  return {
    ...prev,
    activeStage: 2,
    lastStageAt: at,
    events: [{ id, at, topic, message: msg, kind: "switch" as const, stage: 2 as const }, ...prev.events].slice(0, 100),
  };
}

export function useFieldMonitorInternal() {
  const [backend, setBackendState] = useState(DEFAULT_BACKEND);
  const [state, setState] = useState<FieldState>(initialState);
  const [link, setLink] = useState<LinkStatus>("connecting");
  const [nonce, setNonce] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("fc-backend");
    if (saved) setBackendState(saved);
  }, []);

  const setBackend = useCallback((url: string) => {
    const clean = url.trim().replace(/\/$/, "");
    localStorage.setItem("fc-backend", clean);
    setBackendState(clean);
    setNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    let stop = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const open = () => {
      if (stop) return;
      setLink("connecting");
      let ws: WebSocket;
      try {
        ws = new WebSocket(backend.replace(/^http/, "ws") + "/ws");
      } catch {
        setLink("offline");
        return;
      }
      wsRef.current = ws;
      ws.onopen = () => setLink("online");
      ws.onmessage = (e) => {
        try {
          setState(JSON.parse(e.data) as FieldState);
        } catch {
          /* ignore */
        }
      };
      ws.onclose = () => {
        wsRef.current = null;
        if (stop) return;
        setLink("offline");
        retry = setTimeout(open, 3000);
      };
    };
    open();
    return () => {
      stop = true;
      clearTimeout(retry);
      wsRef.current?.close();
    };
  }, [backend, nonce]);

  const call = useCallback(
    async (path: string, body?: unknown) => {
      const res = await fetch(backend + path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : null,
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    [backend],
  );

  const simulate = useCallback(
    (topic: string) => {
      if (link === "online") void call("/simulate", { topic }).catch(() => undefined);
      else setState((p) => applyLocal(p, topic));
    },
    [link, call],
  );

  const reset = useCallback(() => {
    if (link === "online") void call("/reset").catch(() => undefined);
    else setState((p) => ({ ...initialState, mqttHost: p.mqttHost, mqttPort: p.mqttPort }));
  }, [link, call]);

  const configureMqtt = useCallback(
    (host: string, port: number, username: string, password: string) => call("/config", { host, port, username, password }),
    [call],
  );

  return { backend, setBackend, state, link, simulate, reset, configureMqtt };
}

export type FieldMonitor = ReturnType<typeof useFieldMonitorInternal>;
export const FieldContext = createContext<FieldMonitor | null>(null);
export function useField() {
  const ctx = useContext(FieldContext);
  if (!ctx) throw new Error("useField must be inside FieldContext");
  return ctx;
}

/** Ticking clock so flash effects expire on screen. */
export function useNow(ms = 250) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}
