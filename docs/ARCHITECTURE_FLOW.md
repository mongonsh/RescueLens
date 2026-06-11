# RescueLens Architecture And Flow

Hosted app:

```text
https://rescuelens-886752717262.us-central1.run.app
```

Hosted readiness verified on June 11, 2026:

```text
requiredLiveReady: true
prizeReady: true
Gemini: pass
Agent Builder live: pass
Arize MCP live: pass
Arize CV: pass
Live feeds: pass
```

## Creative Architecture Diagram

Use this asset in the README, Devpost gallery, or pitch deck:

```text
docs/assets/rescuelens-architecture.svg
```

![RescueLens architecture](assets/rescuelens-architecture.svg)

## System Flow

```mermaid
flowchart LR
  A[Live disaster feeds<br/>NASA EONET, USGS, NOAA/NWS] --> B[RescueLens Cloud Run app]
  U[Drone or field image upload] --> B
  B --> C[Gemini vision + command planning]
  C --> D[Arize CV telemetry<br/>classification, detection, segmentation, embeddings]
  D --> E[Phoenix MCP failure loop<br/>tools/list, prompts, datasets, experiments]
  C --> F[Google Agent Platform<br/>live Interactions API]
  E --> G[Human approval gate]
  F --> G
  G --> H[Mission artifact<br/>report, dispatch task, route closure, safety plan]
```

## Runtime Proof Flow

```mermaid
sequenceDiagram
  participant Judge
  participant UI as RescueLens UI
  participant API as Cloud Run API
  participant Gemini
  participant Arize as Phoenix MCP
  participant Agent as Google Agent Platform

  Judge->>UI: Click Run judge demo
  UI->>API: Select live incident + frame
  API->>Gemini: Plan mission response
  Gemini-->>API: Action plan + briefing
  API->>Arize: Start Phoenix MCP stdio workflow
  Arize-->>API: Live tools + failure slice
  API->>Agent: Create managed interaction
  Agent-->>API: submitted
  API-->>UI: Runtime integrations pass
  UI->>API: Create mission report
  API-->>Judge: Human-approved artifact
```

## Why This Architecture Matters

- **Cloud Run** gives judges a public URL and keeps deployment simple.
- **Gemini** reasons over images, mission context, and commands.
- **Google Agent Platform** proves the system uses a managed agent runtime, not just a local script.
- **Arize Phoenix MCP** adds partner-powered model observability and failure analysis.
- **Arize CV telemetry** maps the computer vision task to classification, object detection, segmentation, embeddings, drift, monitors, and evaluators.
- **Human approval** is the final gate before any dispatch or route closure artifact is created.

