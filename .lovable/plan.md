# Presentation controls and AI-tailored Live View

## Goal
Give an operator one active, in-memory run with fast presentation controls, a clear elapsed timer, separate connection health, and an AI-generated Live View arrangement based on audience distance.

## What will change

### Run controls and timing
- Add a prominent control bar on Live View with **Start Run**, **Reset Run**, and **Fullscreen**.
- Start Run resets the score and stage, starts an elapsed timer, and marks the run active.
- Reset Run returns the presentation to a ready state and clears the timer and live events.
- Keep the current run only; no run history or database persistence.
- Display elapsed time beside remaining marks and active stage, with clear Ready, Running, and Finished presentation states.

### Connection and device health
- Show separate status indicators for:
  - Dashboard ↔ backend connection
  - Backend ↔ MQTT broker connection
  - Ultrasonic sensor activity
  - Line sensor activity
- Use a calm Demo mode when the backend is unavailable.
- Show automatic reconnect attempts and restore Live status without manual refresh.
- Track the most recent valid event from each sensor so operators can distinguish an idle device from recent activity without changing secure MQTT validation.

### AI-tailored display
- Add an operator panel for a current-run label and audience distance: **Near**, **Room**, or **Projector**.
- Send only presentation preferences and available dashboard sections to Lovable AI; never send MQTT credentials, device secrets, or broker settings.
- Have the model return a constrained layout configuration, not executable markup or code.
- Validate the result before applying it to control section order, emphasis, text scale, and optional secondary-detail visibility.
- Include Generate, Apply, and Restore default actions, with the AI response’s safe error message shown when generation fails.
- Keep the selected/generated display preference in browser memory only for the presentation session; no database.

## Technical details
- Extend the shared field monitor with run status, run label, start timestamp, elapsed-time calculation, reconnect attempt state, and last-seen timestamps for both fixed sensor topics.
- Mirror run start/reset and sensor last-seen fields in the FastAPI in-memory state so all open Live View screens stay synchronized.
- Add a TanStack server function for the AI request using `openai/gpt-6-astra` through the Lovable AI Gateway Responses API with reasoning enabled, `store: false`, streaming consumed server-side, and request-local run-ID propagation.
- Validate both AI input and output with Zod and allow only predefined layout values.
- Keep fixed MQTT topics and signed HMAC payload verification unchanged.
- Use the existing semantic color tokens and industrial visual language; add only semantic tokens/utilities needed for run states and presentation layouts.
- Preserve unique route metadata and update Live View metadata if its purpose changes materially.

## Validation
- Verify Start, Reset, timer progression, and fullscreen behavior in the browser.
- Verify Demo, reconnecting, backend, broker, and sensor status states.
- Run a real AI layout request and confirm the validated result changes the Live View while preserving scoring and sensor effects.
- Confirm fault and stage-switch effects still last one second.
- Check desktop and compact viewport layouts, console errors, Python syntax, and the latest project build.
