# RescueLens Integrations

## Gemini 3

RescueLens uses Gemini for three separate agent capabilities:

- Vision analysis through `/api/analyze-upload`
- Command planning through `/api/agent-command`
- Natural speech through `/api/tts`

Default model settings live in `.env.example`. The app defaults to Gemini 3.5 Flash and can fall back to Gemini 2.5 Flash if a preview model is not available for the key.

The judge demo calls `/api/agent-command` through `runGeminiJudgePlan()` so Gemini command planning is invoked during the main demo path, not only through optional voice controls.

## Google Cloud Agent Builder

`agent-builder/rescuelens-agent.yaml` describes the intended Agent Builder / Gemini Enterprise Agent Platform configuration:

- Cloud Run hosts the RescueLens API and UI.
- HTTP tools expose image analysis, voice planning, and artifact creation.
- Arize Phoenix MCP is the partner tool that gives the agent observability superpowers.
- Guardrails keep responders in control.

The running app also exposes `/api/agent-builder/invoke`. The strongest hosted proof is to point this endpoint at a real Google Cloud Agent Builder / managed-agent HTTPS endpoint:

```bash
GOOGLE_CLOUD_PROJECT="your-google-cloud-project"
AGENT_BUILDER_LOCATION="global"
AGENT_BUILDER_AGENT_ID="your-managed-agent-id"
AGENT_BUILDER_ENDPOINT="https://your-agent-builder-or-agent-runtime-endpoint"
AGENT_BUILDER_ENDPOINT_AUTH="bearer"
AGENT_BUILDER_USE_METADATA_TOKEN=true
```

For a private Cloud Run or Agent Runtime endpoint, keep `AGENT_BUILDER_ENDPOINT_TOKEN_TYPE=id_token` and set `AGENT_BUILDER_ENDPOINT_AUDIENCE` only if the endpoint requires a custom audience. For OAuth-style Google APIs, set `AGENT_BUILDER_ENDPOINT_TOKEN_TYPE=access_token`. For local smoke tests you can set `GOOGLE_CLOUD_ACCESS_TOKEN` or `AGENT_BUILDER_ENDPOINT_TOKEN` instead of using metadata tokens. If the endpoint is missing auth, the UI shows `endpoint-token-needed` instead of claiming a successful managed runtime call.

If `AGENT_BUILDER_ENDPOINT` is not set, RescueLens falls back to the preview Interactions API path controlled by `GOOGLE_CLOUD_PROJECT`, `AGENT_BUILDER_LOCATION`, `AGENT_BUILDER_AGENT_ID`, and `AGENT_BUILDER_API_REVISION`.

## Arize Phoenix MCP

RescueLens supports three MCP modes:

- `demo`: no Phoenix credentials. The app returns an MCP-shaped workflow for judging/demo continuity.
- `http`: set `ARIZE_MCP_HTTP_URL` to a JSON-RPC bridge that supports MCP `tools/list` and `tools/call`.
- `stdio`: set `PHOENIX_BASE_URL` and `PHOENIX_API_KEY`; RescueLens can launch `@arizeai/phoenix-mcp` over stdio.

The visible UI action is **Run MCP loop**. It creates or discovers:

- a low-light failure slice
- prompt/dataset/experiment MCP tools
- an eval comparison
- a review-policy patch recommendation

## Arize CV Observability

`/api/arize/cv-observability` builds an Arize-shaped CV telemetry bundle for the currently selected evidence image or live incident. The payload includes:

- image classification prediction label, score, and metric readiness
- object detection boxes, categories, and scores
- semantic segmentation polygon labels and coordinates
- instance segmentation polygon labels, coordinates, scores, and boxes
- image embedding feature with `image_vector` and `image_link`
- drift cluster, similar failures, monitors, and evaluator definitions
- trace spans for classification, detection, segmentation, embedding drift, and eval coverage

Without Arize credentials the endpoint runs in `local-demo` mode so judges can inspect the exact schemas and UI behavior. Set `ARIZE_API_KEY` and `ARIZE_SPACE_ID` when wiring the same payload into a live Arize AX project.

## Action Artifacts

The agent now creates concrete artifacts through `/api/artifacts`:

- dispatch tasks
- route closures
- eval reports
- mission reports

These artifacts prove that RescueLens moves beyond chat: Gemini plans actions, Phoenix MCP analyzes reliability, and the app writes operational outputs for human approval.

## Required Runtime Proof

Click **Run judge demo** and then inspect the Runtime integrations panel:

- Gemini row should show `called: ...` after `/api/agent-command`.
- Arize Phoenix MCP row should show `http`, `stdio`, `demo`, or `fallback` after `/api/arize/failure-analysis`.
- Google Cloud Agent Builder row should show `interaction called` when `/api/agent-builder/invoke` reaches the hosted managed-agent endpoint or preview Interactions API.

## Live Public Data

`/api/live-data` pulls real public feeds and normalizes them into RescueLens events:

- NASA EONET open natural events
- USGS M4.5+ earthquake GeoJSON feed
- NOAA/NWS active weather alerts

The UI shows source status, event counts, current event cards, and a global coordinate map. Selecting a live event turns that event into the active RescueLens mission context, so Gemini planning, Arize MCP analysis, and action artifacts use the real event details.

Location search uses Open-Meteo Geocoding by default through `/api/location-search?q=...`, then ranks the currently fetched live incidents by distance from the searched place. Set `LOCATION_GEOCODER=nominatim` only if you have made a deliberate decision to use OpenStreetMap Nominatim and can comply with its usage policy.

Public feeds can be unavailable or rate limited. RescueLens exposes that status directly rather than substituting fake results.
