"""
Field Command backend — FastAPI + secure MQTT bridge.

Security:
- MQTT username/password authentication
- Signed MQTT payloads using HMAC-SHA256
- Timestamp validation to prevent old messages
- Nonce replay protection
- Per-device secrets
- Device ID validation
- MQTT topic validation
- Constant-time signature comparison
- In-memory state only

Expected ESP32 MQTT payload:

{
    "device": "APAFORME-001",
    "event": "stage_switching",
    "timestamp": 1727179200,
    "nonce": "8f31a9c2...",
    "signature": "..."
}

or:

{
    "device": "APAFORME-001",
    "event": "line_violation",
    "timestamp": 1727179200,
    "nonce": "8f31a9c2...",
    "signature": "..."
}

Signature:

HMAC-SHA256(
    device_secret,
    f"{device}|{event}|{timestamp}|{nonce}"
)

Run:
    uvicorn main:app --host 0.0.0.0 --port 8000
"""

import asyncio
import hashlib
import hmac
import json
import os
import secrets
import time
import uuid
from typing import Optional

import paho.mqtt.client as mqtt
from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel


# ============================================================
# ENVIRONMENT
# ============================================================

load_dotenv()


# ============================================================
# MQTT TOPICS
# ============================================================

TOPIC_STAGE = "bike/stage_switching"
TOPIC_LINE = "bike/line_violation"


ALLOWED_TOPICS = {
    TOPIC_STAGE,
    TOPIC_LINE,
}


# ============================================================
# GAME SETTINGS
# ============================================================

START_MARKS = 100
FAULT_PENALTY = 1


# ============================================================
# SECURITY SETTINGS
# ============================================================

# Maximum age of an MQTT event.
#
# Example:
# ESP32 sends an event at 12:00:00
# Backend receives it at 12:00:10 -> accepted
# Backend receives it at 12:01:00 -> rejected
#
MAX_MESSAGE_AGE = int(
    os.getenv("MQTT_MAX_MESSAGE_AGE", "30")
)

# Allow small clock differences between ESP32 and backend.
MAX_FUTURE_TIME = int(
    os.getenv("MQTT_MAX_FUTURE_TIME", "10")
)

# Maximum number of remembered nonces.
MAX_NONCES = int(
    os.getenv("MQTT_MAX_NONCES", "5000")
)


# ============================================================
# MQTT CONFIGURATION
# ============================================================

config = {
    "host": os.getenv("MQTT_HOST", "127.0.0.1"),
    "port": int(os.getenv("MQTT_PORT", "1884")),
    "username": os.getenv("MQTT_USER", ""),
    "password": os.getenv("MQTT_PASSWORD", ""),
}


# ============================================================
# DEVICE SECRETS
# ============================================================
#
# NEVER hard-code these secrets in source code.
#
# Example .env:
#
# APAFORME_001_SECRET=your-long-random-secret
# APAFORME_002_SECRET=another-long-random-secret
#
# ============================================================

DEVICE_SECRETS = {
    "APAFORME-001": os.getenv("APAFORME_001_SECRET", ""),
    "APAFORME-002": os.getenv("APAFORME_002_SECRET", ""),
    "APAFORME-003": os.getenv("APAFORME_003_SECRET", ""),
}


# Remove devices that don't have a configured secret.
DEVICE_SECRETS = {
    device: secret
    for device, secret in DEVICE_SECRETS.items()
    if secret
}


# ============================================================
# STATE
# ============================================================

def fresh_state() -> dict:
    return {
        "activeStage": 1,
        "marks": START_MARKS,
        "faults": 0,
        "stage1Faults": 0,
        "stage2Faults": 0,
        "lastLineAt": None,
        "lastStageAt": None,
        "events": [],
    }


state = fresh_state()


# ============================================================
# GLOBALS
# ============================================================

mqtt_connected = False

clients: set[WebSocket] = set()

loop: Optional[asyncio.AbstractEventLoop] = None

mqttc: Optional[mqtt.Client] = None


# ============================================================
# REPLAY PROTECTION
# ============================================================

# nonce -> time received
used_nonces: dict[str, float] = {}


def cleanup_nonces():
    """
    Remove old nonces so memory doesn't grow forever.
    """

    now = time.time()

    expired = [
        nonce
        for nonce, received_at in used_nonces.items()
        if now - received_at > MAX_MESSAGE_AGE
    ]

    for nonce in expired:
        used_nonces.pop(nonce, None)

    # Hard limit as an additional safety measure.
    if len(used_nonces) > MAX_NONCES:

        oldest = sorted(
            used_nonces.items(),
            key=lambda item: item[1],
        )

        remove_count = len(used_nonces) - MAX_NONCES

        for nonce, _ in oldest[:remove_count]:
            used_nonces.pop(nonce, None)


def nonce_already_used(nonce: str) -> bool:
    """
    Returns True if this nonce has already been processed.
    """

    cleanup_nonces()

    if nonce in used_nonces:
        return True

    used_nonces[nonce] = time.time()

    return False


# ============================================================
# SNAPSHOT
# ============================================================

def snapshot() -> dict:
    return {
        **state,
        "mqttConnected": mqtt_connected,
        "mqttHost": config["host"],
        "mqttPort": config["port"],
    }


# ============================================================
# WEBSOCKET BROADCAST
# ============================================================

async def broadcast():

    data = json.dumps(snapshot())

    for ws in list(clients):

        try:
            await ws.send_text(data)

        except Exception:
            clients.discard(ws)


def schedule_broadcast():

    if loop:

        asyncio.run_coroutine_threadsafe(
            broadcast(),
            loop,
        )


# ============================================================
# HMAC VERIFICATION
# ============================================================

def calculate_signature(
    device: str,
    event: str,
    timestamp: int,
    nonce: str,
    secret: str,
) -> str:

    message = (
        f"{device}|"
        f"{event}|"
        f"{timestamp}|"
        f"{nonce}"
    )

    return hmac.new(
        secret.encode("utf-8"),
        message.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def verify_mqtt_message(
    topic: str,
    payload: str,
) -> Optional[dict]:
    """
    Validate an MQTT message.

    Returns parsed data if valid.
    Returns None if rejected.
    """

    # --------------------------------------------------------
    # Topic validation
    # --------------------------------------------------------

    if topic not in ALLOWED_TOPICS:
        print(
            f"[SECURITY] Rejected unknown topic: {topic}"
        )
        return None

    # --------------------------------------------------------
    # JSON parsing
    # --------------------------------------------------------

    try:
        data = json.loads(payload)

    except json.JSONDecodeError:
        print(
            "[SECURITY] Rejected invalid JSON"
        )
        return None

    # --------------------------------------------------------
    # Payload type validation
    # --------------------------------------------------------

    if not isinstance(data, dict):
        print(
            f"[SECURITY] Rejected payload type: "
            f"{type(data).__name__}"
        )
        return None

    # --------------------------------------------------------
    # Required fields
    # --------------------------------------------------------

    required_fields = {
        "device",
        "event",
        "timestamp",
        "nonce",
        "signature",
    }

    if not required_fields.issubset(data.keys()):
        print(
            "[SECURITY] Rejected message with missing fields"
        )
        return None

    # --------------------------------------------------------
    # Validate types
    # --------------------------------------------------------

    device = data["device"]
    event = data["event"]
    nonce = data["nonce"]
    signature = data["signature"]

    try:
        timestamp = int(data["timestamp"])

    except (TypeError, ValueError):
        print(
            "[SECURITY] Rejected invalid timestamp"
        )
        return None

    if not isinstance(device, str):
        print(
            "[SECURITY] Rejected invalid device"
        )
        return None

    if not isinstance(event, str):
        print(
            "[SECURITY] Rejected invalid event"
        )
        return None

    if not isinstance(nonce, str):
        print(
            "[SECURITY] Rejected invalid nonce"
        )
        return None

    if not isinstance(signature, str):
        print(
            "[SECURITY] Rejected invalid signature"
        )
        return None

    # --------------------------------------------------------
    # Device authentication
    # --------------------------------------------------------

    secret = DEVICE_SECRETS.get(device)

    if not secret:
        print(
            f"[SECURITY] Rejected unknown device "
            f"device={device}"
        )
        return None

    # --------------------------------------------------------
    # Event validation
    # --------------------------------------------------------

    expected_event = {
        TOPIC_STAGE: "stage_switching",
        TOPIC_LINE: "line_violation",
    }[topic]

    if event != expected_event:
        print(
            f"[SECURITY] Rejected event/topic mismatch "
            f"topic={topic} event={event}"
        )
        return None

    # --------------------------------------------------------
    # Timestamp validation
    # --------------------------------------------------------

    now = int(time.time())

    age = now - timestamp

    if age > MAX_MESSAGE_AGE:
        print(
            f"[SECURITY] Rejected expired message "
            f"device={device} age={age}s"
        )
        return None

    if timestamp > now + MAX_FUTURE_TIME:
        print(
            f"[SECURITY] Rejected future message "
            f"device={device}"
        )
        return None

    # --------------------------------------------------------
    # Nonce validation
    # --------------------------------------------------------

    if not nonce:
        print(
            "[SECURITY] Rejected empty nonce"
        )
        return None

    if len(nonce) > 128:
        print(
            "[SECURITY] Rejected oversized nonce"
        )
        return None

    # --------------------------------------------------------
    # Replay protection
    # --------------------------------------------------------

    if nonce_already_used(nonce):

        print(
            f"[SECURITY] Rejected replayed nonce "
            f"device={device}"
        )

        return None

    # --------------------------------------------------------
    # Signature verification
    # --------------------------------------------------------

    expected_signature = calculate_signature(
        device=device,
        event=event,
        timestamp=timestamp,
        nonce=nonce,
        secret=secret,
    )

    if not hmac.compare_digest(
        signature,
        expected_signature,
    ):

        print(
            f"[SECURITY] Invalid signature "
            f"device={device}"
        )

        return None

    # --------------------------------------------------------
    # Everything passed
    # --------------------------------------------------------

    print(
        f"[SECURITY] Valid event "
        f"device={device} "
        f"event={event}"
    )

    return data
# ============================================================
# EVENT HANDLER
# ============================================================

def handle(
    topic: str,
    device: str,
    event: str,
):

    now = int(time.time() * 1000)

    stage = state["activeStage"]


    # --------------------------------------------------------
    # LINE VIOLATION
    # --------------------------------------------------------

    if event == "line_violation":

        state["marks"] = max(
            0,
            state["marks"] - FAULT_PENALTY,
        )

        state["faults"] += 1

        state[f"stage{stage}Faults"] += 1

        state["lastLineAt"] = now

        ev = {
            "kind": "fault",
            "stage": stage,
            "device": device,
            "message": (
                f"Line violation in stage {stage} "
                f"· -{FAULT_PENALTY} marks"
            ),
        }


    # --------------------------------------------------------
    # STAGE SWITCH
    # --------------------------------------------------------

    elif event == "stage_switching":

        msg = (
            "Stage 1 ended · Stage 2 active"
            if stage == 1
            else "Object detected · already in stage 2"
        )

        state["activeStage"] = 2

        state["lastStageAt"] = now

        ev = {
            "kind": "switch",
            "stage": 2,
            "device": device,
            "message": msg,
        }


    else:

        print(
            f"[SECURITY] Unknown event rejected: {event}"
        )

        return


    # --------------------------------------------------------
    # EVENT HISTORY
    # --------------------------------------------------------

    state["events"] = (
        [
            {
                "id": uuid.uuid4().hex,
                "at": now,
                "topic": topic,
                **ev,
            }
        ]
        + state["events"]
    )[:100]


    print(
        f"[{topic}] "
        f"device={device} "
        f"{ev['message']} "
        f"marks={state['marks']}"
    )


    schedule_broadcast()


# ============================================================
# MQTT CALLBACKS
# ============================================================

def on_connect(
    client,
    userdata,
    flags,
    reason_code,
    properties=None,
):

    global mqtt_connected

    # Paho MQTT v2 reason code
    mqtt_connected = reason_code == 0

    if mqtt_connected:

        print(
            "MQTT connected "
            f"to {config['host']}:{config['port']}"
        )

        client.subscribe(
            [
                (TOPIC_STAGE, 0),
                (TOPIC_LINE, 0),
            ]
        )

    else:

        print(
            f"MQTT connection failed: {reason_code}"
        )

    schedule_broadcast()


def on_disconnect(
    client,
    userdata,
    *args,
):

    global mqtt_connected

    mqtt_connected = False

    print("MQTT disconnected")

    schedule_broadcast()


def on_message(
    client,
    userdata,
    msg,
):

    payload = msg.payload.decode(
        "utf-8",
        errors="ignore",
    )

    print(
        f"[MQTT] Received topic={msg.topic}"
    )

    verified = verify_mqtt_message(
        msg.topic,
        payload,
    )

    if verified is None:
        return


    handle(
        topic=msg.topic,
        device=verified["device"],
        event=verified["event"],
    )


# ============================================================
# START MQTT
# ============================================================

def start_mqtt():

    global mqttc
    global mqtt_connected


    # Stop previous client
    if mqttc:

        try:
            mqttc.loop_stop()

        except Exception:
            pass

        try:
            mqttc.disconnect()

        except Exception:
            pass


    mqtt_connected = False


    # --------------------------------------------------------
    # Create MQTT client
    # --------------------------------------------------------

    try:

        c = mqtt.Client(
            mqtt.CallbackAPIVersion.VERSION2,
            client_id=(
                f"field-backend-"
                f"{uuid.uuid4().hex[:8]}"
            ),
        )

    except AttributeError:

        # Paho < 2.0 compatibility
        c = mqtt.Client(
            client_id=(
                f"field-backend-"
                f"{uuid.uuid4().hex[:8]}"
            )
        )


    # --------------------------------------------------------
    # MQTT authentication
    # --------------------------------------------------------

    if config["username"]:

        c.username_pw_set(
            config["username"],
            config["password"],
        )


    # --------------------------------------------------------
    # Callbacks
    # --------------------------------------------------------

    c.on_connect = on_connect

    c.on_disconnect = on_disconnect

    c.on_message = on_message


    # --------------------------------------------------------
    # Automatic reconnect
    # --------------------------------------------------------

    c.reconnect_delay_set(
        min_delay=1,
        max_delay=10,
    )


    # --------------------------------------------------------
    # Connect
    # --------------------------------------------------------

    try:

        c.connect_async(
            config["host"],
            config["port"],
            keepalive=30,
        )

        c.loop_start()

        mqttc = c

        print(
            f"Connecting to MQTT "
            f"{config['host']}:{config['port']} ..."
        )

    except Exception as exc:

        mqtt_connected = False

        print(
            f"MQTT startup error: {exc}"
        )


# ============================================================
# FASTAPI
# ============================================================

app = FastAPI(
    title="Field Command backend"
)


# ============================================================
# CORS
# ============================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# STARTUP
# ============================================================

@app.on_event("startup")
async def startup():

    global loop

    loop = asyncio.get_running_loop()

    start_mqtt()


# ============================================================
# STATE API
# ============================================================

@app.get("/state")
def get_state():

    return snapshot()


# ============================================================
# SIMULATION
# ============================================================

class Sim(BaseModel):

    topic: str


@app.post("/simulate")
def simulate(body: Sim):

    if body.topic not in ALLOWED_TOPICS:

        return {
            "ok": False,
            "error": "Invalid topic",
        }


    if body.topic == TOPIC_STAGE:

        event = "stage_switching"

    else:

        event = "line_violation"


    # Simulation is intentionally local/backend-generated.
    handle(
        topic=body.topic,
        device="SIMULATOR",
        event=event,
    )

    return snapshot()


# ============================================================
# RESET
# ============================================================

@app.post("/reset")
async def reset():

    global state

    state = fresh_state()

    await broadcast()

    return snapshot()


# ============================================================
# MQTT CONFIGURATION API
# ============================================================

class Cfg(BaseModel):

    host: str

    port: int = 1884

    username: str = ""

    password: str = ""


@app.post("/config")
async def set_config(body: Cfg):

    config.update(
        host=body.host,
        port=body.port,
        username=body.username,
        password=body.password,
    )

    start_mqtt()

    await broadcast()

    return {
        "ok": True
    }


# ============================================================
# WEBSOCKET
# ============================================================

@app.websocket("/ws")
async def ws_endpoint(
    ws: WebSocket,
):

    await ws.accept()

    clients.add(ws)

    await ws.send_text(
        json.dumps(snapshot())
    )


    try:

        while True:

            await ws.receive_text()


    except WebSocketDisconnect:

        clients.discard(ws)


    except Exception:

        clients.discard(ws)
