const state = {
  mission: null,
  selectedFrame: null,
  trace: null,
  improved: false,
  uploadUrl: null,
  currentAudio: null,
  currentAudioUrl: null,
  integrations: null,
  submissionReadiness: null,
  artifacts: [],
  mcpWorkflow: null,
  cvTelemetry: null,
  cvTelemetryRequestId: 0,
  geminiPlan: null,
  agentBuilderRun: null,
  liveData: null,
  selectedLiveEvent: null,
  locationSearch: null,
  uploadPayload: null,
  hasAutoSelectedLive: false,
  actionLog: [],
  demoRunning: false,
  demoStatus: "Ready",
  voiceTranscript: "No command yet",
  voiceResponse: "Choose a quick command, type, or tap Speak.",
  voiceState: "Ready",
  recognition: null,
  isListening: false,
  isSpeaking: false,
  preferBrowserTts: (() => {
    try {
      return Number(localStorage.getItem("rescuelens-tts-fallback-until") || 0) > Date.now();
    } catch {
      return false;
    }
  })(),
  speechRequestId: 0,
  speechAbortController: null,
  commandRequestId: 0,
  recognitionSessionId: 0,
  lastRecognizedTranscript: "",
  hasFinalRecognitionResult: false,
  maps: {
    live: null,
    liveLayer: null,
    ops: null,
    opsLayer: null
  }
};

const toneColors = {
  danger: "#b42335",
  caution: "#a66300",
  green: "#12805c",
  safe: "#12805c",
  water: "#0b7285",
  smoke: "#6f6a75",
  blue: "#3157a6"
};

const sampleSectorCoordinates = {
  "roof-01": [39.744, -121.861],
  "road-02": [39.735, -121.817],
  "fire-03": [39.708, -121.846],
  "bridge-04": [39.763, -121.792]
};

const elements = {
  missionStatus: document.querySelector("#missionStatus"),
  incidentName: document.querySelector("#incidentName"),
  missionSummary: document.querySelector("#missionSummary"),
  missionStepList: document.querySelector("#missionStepList"),
  demoStatus: document.querySelector("#demoStatus"),
  nextBestAction: document.querySelector("#nextBestAction"),
  runDemoButton: document.querySelector("#runDemoButton"),
  demoAnalyzeButton: document.querySelector("#demoAnalyzeButton"),
  demoArizeButton: document.querySelector("#demoArizeButton"),
  demoReportButton: document.querySelector("#demoReportButton"),
  framesMetric: document.querySelector("#framesMetric"),
  urgentMetric: document.querySelector("#urgentMetric"),
  routesMetric: document.querySelector("#routesMetric"),
  latencyMetric: document.querySelector("#latencyMetric"),
  refreshLiveDataButton: document.querySelector("#refreshLiveDataButton"),
  locationSearchForm: document.querySelector("#locationSearchForm"),
  locationSearchInput: document.querySelector("#locationSearchInput"),
  locationSearchResult: document.querySelector("#locationSearchResult"),
  liveFeedStatus: document.querySelector("#liveFeedStatus"),
  liveWorldMap: document.querySelector("#liveWorldMap"),
  liveGeneratedAt: document.querySelector("#liveGeneratedAt"),
  liveEventList: document.querySelector("#liveEventList"),
  frameList: document.querySelector("#frameList"),
  selectedTitle: document.querySelector("#selectedTitle"),
  selectedSeverity: document.querySelector("#selectedSeverity"),
  stageImage: document.querySelector("#stageImage"),
  heatmapLayer: document.querySelector("#heatmapLayer"),
  overlayLayer: document.querySelector("#overlayLayer"),
  driftLabel: document.querySelector("#driftLabel"),
  riskScore: document.querySelector("#riskScore"),
  analysisSummary: document.querySelector("#analysisSummary"),
  recommendationText: document.querySelector("#recommendationText"),
  intelligenceList: document.querySelector("#intelligenceList"),
  savePlanButton: document.querySelector("#savePlanButton"),
  evidenceList: document.querySelector("#evidenceList"),
  traceId: document.querySelector("#traceId"),
  traceList: document.querySelector("#traceList"),
  cvMode: document.querySelector("#cvMode"),
  cvCoverageList: document.querySelector("#cvCoverageList"),
  cvSchemaNote: document.querySelector("#cvSchemaNote"),
  cvMetricList: document.querySelector("#cvMetricList"),
  cvSimilarityList: document.querySelector("#cvSimilarityList"),
  integrationList: document.querySelector("#integrationList"),
  refreshIntegrationsButton: document.querySelector("#refreshIntegrationsButton"),
  arizeWorkflowButton: document.querySelector("#arizeWorkflowButton"),
  mcpWorkflow: document.querySelector("#mcpWorkflow"),
  missionReportButton: document.querySelector("#missionReportButton"),
  artifactList: document.querySelector("#artifactList"),
  mapMarkers: document.querySelector("#mapMarkers"),
  routeList: document.querySelector("#routeList"),
  safetyRoadList: document.querySelector("#safetyRoadList"),
  mapMode: document.querySelector("#mapMode"),
  rehabMode: document.querySelector("#rehabMode"),
  rehabScene: document.querySelector("#rehabScene"),
  rehabPlanList: document.querySelector("#rehabPlanList"),
  voiceButton: document.querySelector("#voiceButton"),
  speakButton: document.querySelector("#speakButton"),
  stopVoiceButton: document.querySelector("#stopVoiceButton"),
  voiceState: document.querySelector("#voiceState"),
  voiceTranscript: document.querySelector("#voiceTranscript"),
  voiceResponse: document.querySelector("#voiceResponse"),
  voiceForm: document.querySelector("#voiceForm"),
  voiceCommandInput: document.querySelector("#voiceCommandInput"),
  quickCommands: document.querySelector("#quickCommands"),
  actionLog: document.querySelector("#actionLog"),
  opsTitle: document.querySelector("#opsTitle"),
  clusterMap: document.querySelector("#clusterMap"),
  evalList: document.querySelector("#evalList"),
  evalDelta: document.querySelector("#evalDelta"),
  improvementPatch: document.querySelector("#improvementPatch"),
  analyzeButton: document.querySelector("#analyzeButton"),
  improveButton: document.querySelector("#improveButton"),
  stageUploadButton: document.querySelector("#stageUploadButton"),
  uploadButton: document.querySelector("#uploadButton"),
  fileInput: document.querySelector("#fileInput")
};

async function fetchJson(url, options) {
  const response = await fetch(url, {
    headers: { "content-type": "application/json" },
    ...options
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}

function classNames(...names) {
  return names.filter(Boolean).join(" ");
}

function shortText(text, maxLength = 180) {
  const cleanText = String(text || "").replace(/\s+/g, " ").trim();
  if (cleanText.length <= maxLength) {
    return cleanText;
  }
  return `${cleanText.slice(0, Math.max(0, maxLength - 1)).trim()}...`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => {
    const replacements = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    };
    return replacements[character];
  });
}

function getFrameById(frameId) {
  return state.mission.frames.find((frame) => frame.id === frameId);
}

function getActiveSector() {
  return state.mission.operations.sectors.find((sector) => sector.frameId === state.selectedFrame.id);
}

function markerColor(severity) {
  if (severity === "critical") {
    return toneColors.danger;
  }
  if (severity === "high") {
    return toneColors.caution;
  }
  return toneColors.safe;
}

function eventColor(severity) {
  if (severity === "critical") {
    return toneColors.danger;
  }
  if (severity === "high") {
    return toneColors.caution;
  }
  return toneColors.blue || toneColors.safe;
}

function hasLeaflet() {
  return Boolean(window.L?.map && window.L?.tileLayer);
}

function ensureLeafletMap(key, element, options = {}) {
  if (!element || !hasLeaflet()) {
    return null;
  }

  if (!state.maps[key]) {
    element.innerHTML = "";
    const map = window.L.map(element, {
      zoomControl: false,
      scrollWheelZoom: false,
      worldCopyJump: true,
      ...options
    });
    window.L.control.zoom({ position: "bottomright" }).addTo(map);
    window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors"
    }).addTo(map);
    state.maps[key] = map;
    state.maps[`${key}Layer`] = window.L.layerGroup().addTo(map);
    setTimeout(() => map.invalidateSize(), 0);
  }

  return state.maps[key];
}

function fitMapToPoints(map, points, options = {}) {
  const validPoints = points.filter(([lat, lon]) => Number.isFinite(lat) && Number.isFinite(lon));
  if (!validPoints.length) {
    map.setView(options.fallbackCenter || [20, 0], options.fallbackZoom || 2);
    return;
  }
  if (validPoints.length === 1) {
    map.setView(validPoints[0], options.singleZoom || 6);
    return;
  }
  map.fitBounds(window.L.latLngBounds(validPoints), {
    padding: options.padding || [26, 26],
    maxZoom: options.maxZoom || 7
  });
}

function addLeafletIncidentMarker(layer, { lat, lon, color, title, detail, active, onClick }) {
  const marker = window.L.circleMarker([lat, lon], {
    radius: active ? 10 : 7,
    color: "#fffefa",
    weight: 2,
    fillColor: color,
    fillOpacity: 0.96,
    opacity: 1
  });
  marker.bindTooltip(`<strong>${escapeHtml(title)}</strong><span>${escapeHtml(detail || "")}</span>`, {
    direction: "top",
    offset: [0, -8],
    opacity: 0.98,
    className: "rescuelens-map-tooltip"
  });
  if (onClick) {
    marker.on("click", onClick);
  }
  marker.addTo(layer);
  return marker;
}

function renderFallbackLiveEventMap(visibleEvents) {
  elements.liveWorldMap.innerHTML = "";
  if (state.locationSearch?.place) {
    const placeDot = document.createElement("span");
    placeDot.className = "live-dot is-active";
    placeDot.style.left = `${((state.locationSearch.place.lon + 180) / 360) * 100}%`;
    placeDot.style.top = `${((90 - state.locationSearch.place.lat) / 180) * 100}%`;
    placeDot.style.setProperty("--dot-color", toneColors.green);
    placeDot.style.setProperty("--dot-size", "24px");
    placeDot.innerHTML = `<span>${escapeHtml(state.locationSearch.place.name)}</span>`;
    elements.liveWorldMap.append(placeDot);
  }

  visibleEvents
    .filter((event) => Number.isFinite(event.lat) && Number.isFinite(event.lon))
    .forEach((event) => {
      const dot = document.createElement("button");
      dot.type = "button";
      dot.className = classNames("live-dot", state.selectedLiveEvent?.id === event.id && "is-active");
      dot.style.left = `${((event.lon + 180) / 360) * 100}%`;
      dot.style.top = `${((90 - event.lat) / 180) * 100}%`;
      dot.style.setProperty("--dot-color", eventColor(event.severity));
      dot.style.setProperty("--dot-size", event.severity === "critical" ? "22px" : event.severity === "high" ? "18px" : "14px");
      dot.innerHTML = `<span>${escapeHtml(shortText(event.title, 84))}</span>`;
      dot.addEventListener("click", () => selectLiveEvent(event));
      elements.liveWorldMap.append(dot);
    });
}

function renderLiveEventMap(visibleEvents) {
  const map = ensureLeafletMap("live", elements.liveWorldMap, {
    minZoom: 1,
    maxBoundsViscosity: 0.25
  });
  if (!map) {
    renderFallbackLiveEventMap(visibleEvents);
    return;
  }

  const layer = state.maps.liveLayer;
  layer.clearLayers();
  const points = [];

  if (state.locationSearch?.place && Number.isFinite(state.locationSearch.place.lat) && Number.isFinite(state.locationSearch.place.lon)) {
    const place = state.locationSearch.place;
    points.push([place.lat, place.lon]);
    addLeafletIncidentMarker(layer, {
      lat: place.lat,
      lon: place.lon,
      color: toneColors.green,
      title: place.name,
      detail: "Search focus",
      active: true
    });
  }

  visibleEvents
    .filter((event) => Number.isFinite(event.lat) && Number.isFinite(event.lon))
    .forEach((event) => {
      points.push([event.lat, event.lon]);
      addLeafletIncidentMarker(layer, {
        lat: event.lat,
        lon: event.lon,
        color: eventColor(event.severity),
        title: shortText(event.title, 80),
        detail: `${event.source} · ${event.category} · ${event.locationName}`,
        active: state.selectedLiveEvent?.id === event.id,
        onClick: () => selectLiveEvent(event)
      });
    });

  fitMapToPoints(map, points, {
    fallbackCenter: [20, 0],
    fallbackZoom: 2,
    singleZoom: state.locationSearch?.place ? 6 : 4,
    maxZoom: state.locationSearch?.place ? 7 : 4
  });
}

function renderFallbackOperationsMap() {
  if (!elements.mapMarkers) {
    return;
  }
  elements.mapMarkers.hidden = false;
  elements.mapMarkers.innerHTML = "";
  if (state.selectedLiveEvent) {
    const marker = document.createElement("button");
    marker.type = "button";
    marker.className = "map-marker is-active";
    marker.style.left = "50%";
    marker.style.top = "48%";
    marker.style.setProperty("--marker-color", eventColor(state.selectedLiveEvent.severity));
    marker.innerHTML = `LIVE<span>${escapeHtml(state.selectedLiveEvent.category)} · ${escapeHtml(state.selectedLiveEvent.locationName)}</span>`;
    elements.mapMarkers.append(marker);
    return;
  }

  state.mission.operations.sectors.forEach((sector) => {
    const marker = document.createElement("button");
    marker.type = "button";
    marker.className = classNames("map-marker", sector.frameId === state.selectedFrame.id && "is-active");
    marker.style.left = `${sector.x}%`;
    marker.style.top = `${sector.y}%`;
    marker.style.setProperty("--marker-color", markerColor(sector.severity));
    marker.innerHTML = `${sector.label}<span>${escapeHtml(sector.name)} · ${escapeHtml(sector.status)}</span>`;
    marker.addEventListener("click", () => {
      selectFrame(getFrameById(sector.frameId));
      addActionLog(`Map selected ${sector.name} for ${sector.unit}.`);
    });
    elements.mapMarkers.append(marker);
  });
}

function renderOperationsMap() {
  const map = ensureLeafletMap("ops", elements.incidentMap, {
    minZoom: 3
  });
  if (!map) {
    renderFallbackOperationsMap();
    return;
  }

  const layer = state.maps.opsLayer;
  layer.clearLayers();
  const points = [];

  if (state.selectedLiveEvent && Number.isFinite(state.selectedLiveEvent.lat) && Number.isFinite(state.selectedLiveEvent.lon)) {
    const event = state.selectedLiveEvent;
    points.push([event.lat, event.lon]);
    window.L.circle([event.lat, event.lon], {
      radius: event.severity === "critical" ? 35000 : 22000,
      color: eventColor(event.severity),
      fillColor: eventColor(event.severity),
      fillOpacity: 0.12,
      weight: 2
    }).addTo(layer);
    addLeafletIncidentMarker(layer, {
      lat: event.lat,
      lon: event.lon,
      color: eventColor(event.severity),
      title: event.title,
      detail: `${event.category} · ${event.locationName}`,
      active: true
    });
    fitMapToPoints(map, points, { singleZoom: 8, maxZoom: 9 });
    return;
  }

  const sectorPoints = state.mission.operations.sectors
    .map((sector) => ({ sector, coords: sampleSectorCoordinates[sector.frameId] }))
    .filter((item) => item.coords);

  sectorPoints.forEach(({ sector, coords }) => {
    points.push(coords);
    addLeafletIncidentMarker(layer, {
      lat: coords[0],
      lon: coords[1],
      color: markerColor(sector.severity),
      title: `${sector.label} · ${sector.name}`,
      detail: `${sector.status} · ${sector.unit} · ETA ${sector.eta}`,
      active: sector.frameId === state.selectedFrame.id,
      onClick: () => {
        selectFrame(getFrameById(sector.frameId));
        addActionLog(`Map selected ${sector.name} for ${sector.unit}.`);
      }
    });
  });

  if (points.length > 1) {
    window.L.polyline(points, {
      color: "#34a853",
      weight: 4,
      opacity: 0.64,
      dashArray: "8 7"
    }).addTo(layer);
  }

  fitMapToPoints(map, points, {
    fallbackCenter: [39.74, -121.83],
    fallbackZoom: 11,
    singleZoom: 11,
    maxZoom: 12
  });
}

function selectFrame(frame, options = {}) {
  if (!frame) {
    return;
  }
  if (!options.keepLiveEvent && !frame.liveEvent) {
    state.selectedLiveEvent = null;
  }
  if (frame.id !== "upload") {
    state.uploadPayload = null;
  }
  state.selectedFrame = frame;
  state.trace = null;
  state.improved = false;
  state.cvTelemetry = null;
  state.geminiPlan = null;
  state.agentBuilderRun = null;
  renderAll();
  refreshCvTelemetry().catch((error) => console.warn("Arize CV telemetry failed", error));
}

function pickDefaultLiveEvent(events = []) {
  return (
    events.find((event) => event.imageUrl && event.severity === "critical") ||
    events.find((event) => event.imageUrl && event.severity === "high") ||
    events.find((event) => event.imageUrl) ||
    events[0] ||
    null
  );
}

function droneCropForEvent(event) {
  const text = `${event.category || ""} ${event.title || ""} ${event.description || ""}`.toLowerCase();
  if (text.includes("fire") || text.includes("wildfire") || text.includes("smoke")) {
    return "crop-bottom-left";
  }
  if (text.includes("bridge") || text.includes("infrastructure") || text.includes("earthquake")) {
    return "crop-bottom-right";
  }
  if (text.includes("road") || text.includes("route") || text.includes("debris") || text.includes("storm")) {
    return "crop-top-right";
  }
  return "crop-top-left";
}

function setLiveEventContext(event) {
  if (!event) {
    return false;
  }
  state.selectedLiveEvent = event;
  state.selectedFrame = liveEventToFrame(event);
  state.uploadPayload = null;
  state.trace = null;
  state.improved = false;
  state.cvTelemetry = null;
  state.geminiPlan = null;
  state.agentBuilderRun = null;
  return true;
}

function liveEventToFrame(event) {
  return {
    id: event.id,
    title: event.title,
    location: event.locationName,
    cropClass: droneCropForEvent(event),
    condition: `${event.category} · ${event.source}`,
    severity: event.severity === "medium" ? "high" : event.severity,
    confidence: 0.66,
    drift: "drone evidence view + satellite context",
    labels: [event.source, event.category, event.status],
    visualAsset: "drone",
    droneImageUrl: "/assets/drone-mosaic.png",
    satelliteUrl: event.imageUrl,
    imageCredit: "Drone-style response evidence frame",
    detections: [],
    liveEvent: event,
    analysis: {
      summary: `${event.description} This is live public event data from ${event.source}, not synthetic mission data.`,
      riskScore: event.riskScore,
      recommendation:
        "Use this live incident as the mission context, replace the drone-style preview with uploaded field/drone imagery when available, then run Arize MCP failure analysis before operational action.",
      evidence: [
        `Source: ${event.source}`,
        "Evidence view: drone-style response frame",
        event.imageSource ? `Satellite context: ${event.imageSource}` : "Satellite context: unavailable",
        `Updated: ${event.updated ? new Date(event.updated).toLocaleString() : "unknown"}`,
        `Location: ${event.locationName}`,
        event.sourceUrl
      ],
      reviewReason: "Live feed selected; requires human validation and image confirmation"
    }
  };
}

function renderMission() {
  const { mission, metrics } = state.mission;
  if (state.selectedLiveEvent) {
    const events = state.liveData?.events || [];
    elements.missionStatus.textContent = "Live public event";
    elements.incidentName.textContent = shortText(state.selectedLiveEvent.title, 96);
    elements.missionSummary.textContent = `${shortText(state.selectedLiveEvent.description, 185)} Source: ${state.selectedLiveEvent.source}. Drone evidence is ready; satellite context is retained for geospatial validation.`;
    elements.framesMetric.textContent = events.length;
    elements.urgentMetric.textContent = events.filter((event) => event.severity === "critical").length;
    elements.routesMetric.textContent = state.liveData?.feeds?.filter((feed) => feed.status === "live").length || 0;
    elements.latencyMetric.textContent = state.selectedLiveEvent.time
      ? new Date(state.selectedLiveEvent.time).toLocaleTimeString()
      : "live";
    return;
  }

  elements.missionStatus.textContent = state.liveData ? "Live feeds ready" : mission.status;
  elements.incidentName.textContent = mission.incident;
  elements.missionSummary.textContent = `${shortText(mission.summary, 180)} Select a live incident or upload a drone image to move from sample mode into field evidence mode.`;
  elements.framesMetric.textContent = state.liveData?.events?.length || metrics.frames;
  elements.urgentMetric.textContent =
    state.liveData?.events?.filter((event) => event.severity === "critical").length || metrics.urgentFindings;
  elements.routesMetric.textContent = state.liveData?.feeds?.filter((feed) => feed.status === "live").length || metrics.routesBlocked;
  elements.latencyMetric.textContent = state.liveData ? "live" : metrics.avgLatency;
}

function renderMissionRun() {
  const frame = state.selectedFrame;
  const latestArtifact = state.artifacts?.[0] || null;
  const hasLiveIncident = Boolean(state.selectedLiveEvent);
  const hasDroneEvidence = Boolean(
    state.uploadUrl ||
      frame?.visualAsset === "drone" ||
      frame?.imageUrl ||
      frame?.droneImageUrl
  );
  const hasGeminiTrace = Boolean(state.trace);
  const hasGeminiPlan = Boolean(state.geminiPlan?.action);
  const hasArizeTelemetry = Boolean(state.cvTelemetry);
  const hasArizeLoop = Boolean(state.mcpWorkflow);
  const hasAgentBuilderProof = Boolean(state.agentBuilderRun);
  const hasAgentBuilderRun = Boolean(state.agentBuilderRun?.called);
  const hasActionArtifact = Boolean(latestArtifact);

  const steps = [
    {
      label: "Live incident",
      detail: hasLiveIncident
        ? `${state.selectedLiveEvent.source} · ${shortText(state.selectedLiveEvent.title, 54)}`
        : "Pick from the live queue or search a place",
      ready: hasLiveIncident
    },
    {
      label: "Drone evidence",
      detail: state.uploadUrl
        ? "Uploaded field image is active"
        : frame?.visualAsset === "drone"
          ? "Drone-style response frame is active"
          : "Sample CV image is active",
      ready: hasDroneEvidence
    },
    {
      label: "Gemini plan",
      detail: hasGeminiPlan
        ? `${state.geminiPlan.action.replaceAll("_", " ")} plan ready`
        : hasGeminiTrace
          ? "Trace ready; request command plan"
          : "Analyze image and request command plan",
      ready: hasGeminiTrace && hasGeminiPlan
    },
    {
      label: "Arize CV",
      detail: hasArizeLoop
        ? "MCP failure loop completed"
        : hasArizeTelemetry
          ? `${state.cvTelemetry.capabilities.length} CV observability services ready`
          : "Telemetry is building",
      ready: hasArizeTelemetry
    },
    {
      label: "Agent Builder",
      detail: hasAgentBuilderProof
        ? `${state.agentBuilderRun.mode} interaction proof`
        : "Invoke managed agent runtime proof",
      ready: hasAgentBuilderRun
    },
    {
      label: "Human action",
      detail: hasActionArtifact ? `${latestArtifact.type.replaceAll("_", " ")} created` : "Create a report or dispatch task",
      ready: hasActionArtifact
    }
  ];

  elements.missionStepList.innerHTML = "";
  steps.forEach((step, index) => {
    const row = document.createElement("div");
    row.className = classNames("mission-run-step", step.ready && "is-ready");
    row.innerHTML = `
      <span class="mission-step-index">${index + 1}</span>
      <span>
        <strong>${escapeHtml(step.label)}</strong>
        <p>${escapeHtml(step.detail)}</p>
      </span>
      <span class="mission-state-chip">${step.ready ? "ready" : "next"}</span>
    `;
    elements.missionStepList.append(row);
  });

  let nextAction = "Search or pick a live incident";
  if (state.demoRunning) {
    nextAction = "Running the full supervised mission loop";
  } else if (!hasDroneEvidence) {
    nextAction = "Upload or select an evidence image";
  } else if (!hasGeminiTrace || !hasGeminiPlan) {
    nextAction = "Analyze and plan with Gemini";
  } else if (!hasArizeLoop) {
    nextAction = "Run the Arize failure loop";
  } else if (!hasAgentBuilderRun) {
    nextAction = "Invoke Agent Builder runtime proof";
  } else if (!hasActionArtifact) {
    nextAction = "Create the human-approved report";
  } else if (hasLiveIncident) {
    nextAction = "Demo-ready: narrate the incident, Arize risk check, and approved output";
  }

  elements.nextBestAction.textContent = nextAction;
  elements.demoStatus.textContent = state.demoStatus;
  elements.runDemoButton.disabled = state.demoRunning;
  elements.demoAnalyzeButton.disabled = state.demoRunning;
  elements.demoArizeButton.disabled = state.demoRunning;
  elements.demoReportButton.disabled = state.demoRunning;
}

function renderFrameList() {
  elements.frameList.innerHTML = "";
  state.mission.frames.forEach((frame) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = classNames("frame-card", frame.id === state.selectedFrame.id && "is-active");
    button.innerHTML = `
      <span class="frame-thumb ${frame.cropClass}" aria-hidden="true"></span>
      <span>
        <strong>${frame.title}</strong>
        <p>${frame.location} · ${frame.condition}</p>
        <span class="chip-row">
          <span class="chip">${frame.severity}</span>
          <span class="chip">${Math.round(frame.confidence * 100)}%</span>
        </span>
      </span>
    `;
    button.addEventListener("click", () => {
      selectFrame(frame);
    });
    elements.frameList.append(button);
  });
}

function renderLiveData() {
  if (!state.liveData) {
    elements.liveGeneratedAt.textContent = "loading";
    elements.liveFeedStatus.innerHTML = `<span class="feed-chip" style="--chip-color:${toneColors.blue}">Loading public feeds</span>`;
    elements.liveWorldMap.innerHTML = "";
    elements.liveEventList.innerHTML = `<div class="live-event-card"><p>Loading NASA EONET, USGS, and NOAA/NWS data...</p></div>`;
    return;
  }

  const visibleEvents = state.locationSearch?.nearestEvents?.length ? state.locationSearch.nearestEvents : state.liveData.events;
  elements.liveGeneratedAt.textContent = new Date(state.liveData.generatedAt).toLocaleTimeString();
  if (state.locationSearch?.place) {
    elements.locationSearchResult.innerHTML = `<strong>${state.locationSearch.place.name}</strong> · showing nearest live incidents`;
  } else {
    elements.locationSearchResult.textContent = "Search a location to rank live incidents by distance.";
  }

  elements.liveFeedStatus.innerHTML = "";
  state.liveData.feeds.forEach((feed) => {
    const chip = document.createElement("span");
    chip.className = "feed-chip";
    chip.style.setProperty("--chip-color", feed.status === "live" ? toneColors.green : toneColors.caution);
    chip.textContent = `${feed.name}: ${feed.status} (${feed.count})`;
    elements.liveFeedStatus.append(chip);
  });

  renderLiveEventMap(visibleEvents);

  elements.liveEventList.innerHTML = "";
  if (!visibleEvents.length) {
    elements.liveEventList.innerHTML = `<div class="live-event-card"><p>No live events were returned. Check feed status or network access.</p></div>`;
    return;
  }

  visibleEvents.forEach((event) => {
    const card = document.createElement("button");
    card.type = "button";
    const cropClass = droneCropForEvent(event);
    card.className = classNames("live-event-card", state.selectedLiveEvent?.id === event.id && "is-active");
    card.style.setProperty("--event-color", eventColor(event.severity));
    const locationText =
      event.distanceKm === null || event.distanceKm === undefined
        ? event.locationName
        : `${Math.round(event.distanceKm)} km away · ${event.locationName}`;
    card.innerHTML = `
      <span class="event-card-layout">
        <span class="event-thumb drone-thumb ${cropClass}" aria-hidden="true"></span>
        <span class="event-copy">
          <span class="event-card-header">
            <strong>${escapeHtml(shortText(event.title, 82))}</strong>
            <span class="source-pill">${escapeHtml(event.source)}</span>
          </span>
          <span class="event-meta">${escapeHtml(event.category)} · ${escapeHtml(event.severity)} · ${escapeHtml(locationText)}</span>
          <span class="event-description">${escapeHtml(shortText(event.description, 155))}</span>
        </span>
      </span>
    `;
    card.addEventListener("click", () => selectLiveEvent(event));
    elements.liveEventList.append(card);
  });
}

function selectLiveEvent(event) {
  setLiveEventContext(event);
  addActionLog(`Live event selected from ${event.source}: ${event.title}.`);
  renderAll();
  refreshCvTelemetry().catch((error) => console.warn("Arize CV telemetry failed", error));
}

function renderSelectedFrame() {
  const frame = state.selectedFrame;
  const analysis = frame.analysis;
  elements.selectedTitle.textContent = `${frame.title} · ${frame.location}`;
  elements.selectedSeverity.textContent = frame.severity;
  elements.selectedSeverity.className = classNames("severity", frame.severity);
  const shouldShowFullImage = Boolean(frame.imageUrl && frame.visualAsset !== "drone");
  elements.stageImage.className = classNames(
    "mosaic-crop",
    shouldShowFullImage && "is-full-image",
    frame.visualAsset === "drone" && "drone-crop",
    !shouldShowFullImage && frame.cropClass
  );
  if (shouldShowFullImage) {
    elements.stageImage.style.backgroundImage = `url("${frame.imageUrl}")`;
    elements.stageImage.style.backgroundSize = "contain";
    elements.stageImage.style.backgroundPosition = "center";
    elements.stageImage.style.backgroundRepeat = "no-repeat";
  } else {
    elements.stageImage.style.backgroundImage = "";
    elements.stageImage.style.backgroundSize = "200% 200%";
    elements.stageImage.style.backgroundPosition = "";
    elements.stageImage.style.backgroundRepeat = "no-repeat";
  }
  elements.driftLabel.textContent = frame.drift;
  elements.riskScore.textContent = analysis.riskScore;
  elements.analysisSummary.textContent = analysis.summary;
  elements.recommendationText.textContent = state.improved
    ? `Arize improvement applied. ${analysis.recommendation}`
    : analysis.recommendation;
  const evidence = Array.isArray(analysis.evidence) ? analysis.evidence : [];
  renderEvidence(state.improved ? [...evidence, "Arize eval slice applied: +17 recall"] : evidence);
  renderImageOverlays(frame);
  renderFieldIntelligence(frame);
}

function renderEvidence(evidence) {
  elements.evidenceList.innerHTML = "";
  evidence.forEach((item) => {
    const row = document.createElement("span");
    row.textContent = item;
    elements.evidenceList.append(row);
  });
}

function polygonCss(points) {
  return points.map(([x, y]) => `${x}% ${y}%`).join(", ");
}

function renderImageOverlays(frame) {
  elements.overlayLayer.innerHTML = "";
  elements.heatmapLayer.innerHTML = "";
  const telemetry = state.cvTelemetry?.frameId === frame.id ? state.cvTelemetry : null;
  const semanticSegments = telemetry?.segmentation?.semantic || [];
  const instanceSegments = telemetry?.segmentation?.instance || [];
  const detections = telemetry?.objectDetection?.predictions || frame.detections || [];
  const heatmap = telemetry?.fieldIntelligence?.heatmap || [];

  heatmap.forEach((spot) => {
    const marker = document.createElement("div");
    marker.className = classNames("heatmap-spot", `tone-${spot.tone || "caution"}`);
    marker.style.left = `${spot.x}%`;
    marker.style.top = `${spot.y}%`;
    marker.style.setProperty("--heat-size", `${spot.radius}px`);
    marker.style.setProperty("--heat-color", toneColors[spot.tone] || toneColors.caution);
    marker.style.setProperty("--heat-opacity", String(Math.max(0.22, Math.min(0.86, spot.intensity / 100))));
    marker.title = `${spot.label}: ${spot.intensity}%`;
    elements.heatmapLayer.append(marker);
  });

  semanticSegments.forEach((segment) => {
    const mask = document.createElement("div");
    mask.className = "segmentation-mask semantic-mask";
    mask.style.clipPath = `polygon(${polygonCss(segment.polygon)})`;
    mask.style.setProperty("--mask-color", toneColors.water);
    mask.innerHTML = `<span>${segment.label.replaceAll("_", " ")}</span>`;
    elements.overlayLayer.append(mask);
  });

  instanceSegments.forEach((segment) => {
    const mask = document.createElement("div");
    mask.className = "segmentation-mask instance-mask";
    mask.style.clipPath = `polygon(${polygonCss(segment.polygon)})`;
    mask.style.setProperty("--mask-color", toneColors[segment.tone] || toneColors.caution);
    elements.overlayLayer.append(mask);
  });

  detections.forEach((detection) => {
    const [left, top, width, height] = detection.box || detection.coordinates || [];
    const box = document.createElement("div");
    box.className = "detection-box";
    box.style.left = `${left}%`;
    box.style.top = `${top}%`;
    box.style.width = `${width}%`;
    box.style.height = `${height}%`;
    box.style.setProperty("--box-color", toneColors[detection.tone] || toneColors.caution);
    box.innerHTML = `<span class="detection-label">${(detection.displayLabel || detection.label).replaceAll("_", " ")} ${Math.round((detection.confidence || detection.score || 0) * 100)}%</span>`;
    elements.overlayLayer.append(box);
  });
}

function renderFieldIntelligence(frame) {
  const telemetry = state.cvTelemetry?.frameId === frame.id ? state.cvTelemetry : null;
  const groups = telemetry?.fieldIntelligence?.detectionGroups || [];
  elements.intelligenceList.innerHTML = "";

  if (!groups.length) {
    elements.intelligenceList.innerHTML = `
      <div class="intelligence-row">
        <strong>Arize CV is preparing field intelligence</strong>
        <span>loading</span>
        <p>Heatmap, disaster detection, human/animal sweep, road detection, and safety-road scoring will appear here.</p>
      </div>
    `;
    return;
  }

  groups.forEach((group) => {
    const row = document.createElement("div");
    row.className = classNames("intelligence-row", `status-${group.status}`);
    row.innerHTML = `
      <strong>${group.name}</strong>
      <span>${group.status} · ${group.count} findings · ${group.confidence}%</span>
      <p>${group.detail}</p>
    `;
    elements.intelligenceList.append(row);
  });
}

function renderTrace() {
  const trace = state.trace;
  elements.traceId.textContent = trace ? trace.traceId.slice(0, 8) : "trace pending";
  elements.traceList.innerHTML = "";
  const spans = trace?.spans || [
    {
      name: "waiting_for_analysis",
      latencyMs: 0,
      status: "mock",
      output: "Analyze a frame to create a Phoenix-style trace"
    }
  ];

  spans.forEach((span) => {
    const row = document.createElement("div");
    row.className = "trace-row";
    row.innerHTML = `
      <strong>${span.name}</strong>
      <span class="trace-status ${span.status}">${span.status} · ${span.latencyMs}ms</span>
      <p>${span.output}${span.arize ? ` · ${span.arize}` : ""}</p>
    `;
    elements.traceList.append(row);
  });
}

function renderArizeCvTelemetry() {
  const telemetry = state.cvTelemetry;
  if (!telemetry) {
    elements.cvMode.textContent = "loading";
    elements.cvCoverageList.innerHTML = `<div class="cv-row"><p>Building Arize CV telemetry for the selected image...</p></div>`;
    elements.cvSchemaNote.textContent = "Classification, object detection, segmentation, embeddings, and eval schemas will appear here.";
    elements.cvMetricList.innerHTML = "";
    elements.cvSimilarityList.innerHTML = "";
    return;
  }

  elements.cvMode.textContent = telemetry.configured ? "arize-ready" : "local telemetry";
  elements.cvCoverageList.innerHTML = "";
  telemetry.capabilities.forEach((capability) => {
    const row = document.createElement("div");
    row.className = "cv-row";
    row.innerHTML = `
      <header>
        <strong>${capability.name}</strong>
        <span>${capability.status}</span>
      </header>
      <p>${capability.detail}</p>
    `;
    elements.cvCoverageList.append(row);
  });

  elements.cvSchemaNote.innerHTML = `
    <strong>Arize row:</strong>
    ${telemetry.predictionRow.prediction_label} ·
    ${telemetry.predictionRow.prediction_bboxes.length} boxes ·
    ${telemetry.predictionRow.prediction_semantic_segmentation_polygon_coordinates.length} semantic mask ·
    ${telemetry.predictionRow.prediction_instance_segmentation_polygon_coordinates.length} instance masks ·
    ${telemetry.predictionRow.image_vector.length}D image vector
  `;

  elements.cvMetricList.innerHTML = "";
  telemetry.metrics.forEach((metric) => {
    const item = document.createElement("div");
    item.className = "cv-metric-row";
    item.innerHTML = `
      <strong>${metric.family}</strong>
      <span>${metric.status}</span>
      <p>${metric.metric}: ${metric.value}</p>
    `;
    elements.cvMetricList.append(item);
  });

  elements.cvSimilarityList.innerHTML = "";
  telemetry.embedding.similarFailures.forEach((item) => {
    const row = document.createElement("div");
    row.className = "cv-similarity-row";
    row.innerHTML = `<strong>${item.cluster}</strong><span>distance ${item.distance} · ${item.priorFailures} prior misses</span>`;
    elements.cvSimilarityList.append(row);
  });
}

function renderIntegrations() {
  if (!state.integrations) {
    elements.integrationList.innerHTML = `<div class="integration-row"><p>Loading integration status...</p></div>`;
    return;
  }

  const rows = [
    {
      name: "Gemini 3 reasoning",
      status: state.geminiPlan?.action ? "live" : state.integrations.gemini.configured ? "warn" : "warn",
      value: state.geminiPlan?.action
        ? `called: ${state.geminiPlan.action}`
        : state.integrations.gemini.configured
          ? state.integrations.gemini.agentModel
          : "API key missing",
      detail: state.geminiPlan?.spokenResponse
        ? `Runtime plan: ${state.geminiPlan.spokenResponse}`
        : `Vision, command planning, and TTS use ${state.integrations.gemini.model}; fallback ${state.integrations.gemini.fallbackModel}.`
    },
    {
      name: "Google Cloud Agent Builder",
      status: state.agentBuilderRun?.called ? "live" : state.agentBuilderRun ? "warn" : "demo",
      value: state.agentBuilderRun?.called
        ? "interaction called"
        : state.agentBuilderRun?.mode || state.integrations.googleCloud.deployment,
      detail: state.agentBuilderRun
        ? `${state.agentBuilderRun.platform}; agent ${state.agentBuilderRun.agent}; ${state.agentBuilderRun.summary}`
        : `${state.integrations.googleCloud.agentPlatform}; agent ${state.integrations.googleCloud.agentBuilder.agent}; ${state.integrations.googleCloud.agentBuilder.auth}.`
    },
    {
      name: "Arize Phoenix MCP",
      status: state.mcpWorkflow?.connected ? "live" : state.integrations.arize.mcpMode === "demo" ? "demo" : "warn",
      value: state.mcpWorkflow?.mode || state.integrations.arize.mcpMode,
      detail: state.mcpWorkflow?.summary || `${state.integrations.arize.mcpServer}; Phoenix ${state.integrations.arize.phoenixBaseUrl}.`
    },
    {
      name: "Prize readiness",
      status: state.geminiPlan?.action && state.agentBuilderRun?.called && state.mcpWorkflow?.connected ? "live" : "warn",
      value: state.geminiPlan?.action && state.agentBuilderRun?.called && state.mcpWorkflow?.connected ? "required tech live" : "required tech pending",
      detail:
        state.geminiPlan?.action && state.agentBuilderRun?.called && state.mcpWorkflow?.connected
          ? "Gemini command planning, Agent Builder, and Arize MCP were all invoked in this session."
          : "Hosted demo must show Gemini called, Agent Builder interaction called, and Arize MCP http/stdio before submission."
    }
  ];

  elements.integrationList.innerHTML = "";
  rows.forEach((row) => {
    const item = document.createElement("div");
    item.className = "integration-row";
    item.innerHTML = `
      <header>
        <strong>${row.name}</strong>
        <span class="integration-status ${row.status}">${row.value}</span>
      </header>
      <p>${row.detail}</p>
    `;
    elements.integrationList.append(item);
  });
}

function renderMcpWorkflow() {
  if (!state.mcpWorkflow) {
    elements.mcpWorkflow.textContent =
      "Run the Arize MCP loop to create a failure slice, compare eval results, and propose a patch.";
    return;
  }

  elements.mcpWorkflow.innerHTML = `
    <div class="mcp-summary">${state.mcpWorkflow.summary}</div>
    ${state.mcpWorkflow.tools
      .map(
        (tool) => `
          <div class="mcp-step">
            <strong>${tool.name}</strong>
            <span>${tool.status} · ${tool.output}</span>
          </div>
        `
      )
      .join("")}
  `;
}

function renderArtifacts() {
  elements.artifactList.innerHTML = "";
  const artifacts = state.artifacts || [];
  if (!artifacts.length) {
    elements.artifactList.innerHTML = `<div class="artifact-row"><p>No action artifacts yet. Dispatch, close a route, run improvement, or create a report.</p></div>`;
    return;
  }

  artifacts.slice(0, 5).forEach((artifact) => {
    const row = document.createElement("div");
    row.className = "artifact-row";
    row.innerHTML = `
      <header>
        <strong>${artifact.title}</strong>
        <span class="integration-status live">${artifact.type}</span>
      </header>
      <p>${new Date(artifact.createdAt).toLocaleString()} · ${artifact.body?.humanApprovalRequired ? "human approval required" : "generated"}</p>
    `;
    elements.artifactList.append(row);
  });
}

function renderClusters() {
  elements.clusterMap.innerHTML = "";
  state.mission.clusters.forEach((cluster) => {
    const point = document.createElement("div");
    const size = Math.max(42, Math.min(78, cluster.count * 2.1));
    const color =
      cluster.severity === "critical" ? "#b42335" : cluster.severity === "high" ? "#a66300" : "#12805c";
    point.className = "cluster-point";
    point.style.left = `${cluster.x}%`;
    point.style.top = `${cluster.y}%`;
    point.style.setProperty("--size", `${size}px`);
    point.style.setProperty("--cluster-color", color);
    point.innerHTML = `${cluster.count}<span class="cluster-label">${cluster.label}</span>`;
    elements.clusterMap.append(point);
  });
}

function renderEvals() {
  elements.evalList.innerHTML = "";
  state.mission.evals.forEach((evalItem) => {
    const row = document.createElement("div");
    row.className = "eval-row";
    const before = evalItem.before;
    const after = state.improved ? evalItem.after : evalItem.before;
    const beforeWidth = evalItem.lowerIsBetter ? 100 - before : before;
    const afterWidth = evalItem.lowerIsBetter ? 100 - after : after;
    const suffix = evalItem.lowerIsBetter ? "% FNR" : "%";
    row.innerHTML = `
      <header>
        <strong>${evalItem.label}</strong>
        <span>${before}${suffix} to ${after}${suffix}</span>
      </header>
      <div class="bar-track" aria-hidden="true">
        <span class="bar-before" style="width:${beforeWidth}%"></span>
        <span class="bar-after" style="width:${afterWidth}%"></span>
      </div>
    `;
    elements.evalList.append(row);
  });
}

function renderOperations() {
  if (state.selectedLiveEvent) {
    elements.opsTitle.textContent = "Live incident workflow";
    elements.mapMode.textContent = "OpenStreetMap live";
    renderOperationsMap();

    const workflowRoutes = [
      { label: "Confirm imagery", status: state.selectedLiveEvent.imageUrl ? "Satellite snapshot ready" : "Upload needed", eta: "now", tone: state.selectedLiveEvent.imageUrl ? "safe" : "caution" },
      { label: "Arize MCP", status: "Failure analysis", eta: "ready", tone: "safe" },
      { label: "Human action", status: "Approval required", eta: "pending", tone: "caution" }
    ];
    elements.routeList.innerHTML = "";
    workflowRoutes.forEach((route) => {
      const row = document.createElement("div");
      row.className = "route-row";
      row.style.setProperty("--route-color", toneColors[route.tone] || toneColors.caution);
      row.innerHTML = `<strong>${route.label}</strong><span>${route.status} · ${route.eta}</span>`;
      elements.routeList.append(row);
    });
    renderSafetyRoads();
    return;
  }

  elements.opsTitle.textContent = "Sample response sectors";
  elements.mapMode.textContent = getActiveSector()?.status || "OpenStreetMap ops";
  renderOperationsMap();

  elements.routeList.innerHTML = "";
  state.mission.operations.routes.forEach((route) => {
    const row = document.createElement("div");
    row.className = "route-row";
    row.style.setProperty("--route-color", toneColors[route.tone] || toneColors.caution);
    row.innerHTML = `<strong>${route.label}</strong><span>${route.status} · ${route.eta}</span>`;
    elements.routeList.append(row);
  });
  renderSafetyRoads();
}

function renderSafetyRoads() {
  const telemetry = state.cvTelemetry?.frameId === state.selectedFrame.id ? state.cvTelemetry : null;
  const roads = telemetry?.fieldIntelligence?.safetyRoads || [];
  elements.safetyRoadList.innerHTML = "";

  if (!roads.length) {
    elements.safetyRoadList.innerHTML = `
      <div class="safety-road-row">
        <strong>Safety road calculation pending</strong>
        <span>Arize CV telemetry will score primary, detour, and scout corridors.</span>
      </div>
    `;
    return;
  }

  roads.forEach((road) => {
    const row = document.createElement("div");
    row.className = classNames("safety-road-row", `is-${road.status}`);
    row.innerHTML = `
      <header>
        <strong>${road.name}</strong>
        <span>${road.status} · ${road.score}/100</span>
      </header>
      <div class="road-score-track" aria-hidden="true"><span style="width:${road.score}%"></span></div>
      <p>${road.reason}</p>
    `;
    elements.safetyRoadList.append(row);
  });
}

function renderRehabilitationPlan() {
  const telemetry = state.cvTelemetry?.frameId === state.selectedFrame.id ? state.cvTelemetry : null;
  const plan = telemetry?.fieldIntelligence?.rehabilitationPlan || null;
  elements.rehabScene.innerHTML = "";
  elements.rehabPlanList.innerHTML = "";

  if (!plan) {
    elements.rehabMode.textContent = "TCT plan";
    elements.rehabScene.innerHTML = `
      <div class="rehab-plane"></div>
      <div class="rehab-empty">Waiting for Arize CV safety-road and segmentation telemetry</div>
    `;
    elements.rehabPlanList.innerHTML = `
      <div class="rehab-step"><strong>Plan pending</strong><span>Analyze or wait for CV telemetry to generate the recovery sequence.</span></div>
    `;
    return;
  }

  elements.rehabMode.textContent = plan.mode;
  elements.rehabScene.innerHTML = `<div class="rehab-plane"></div>`;
  plan.scene.forEach((zone) => {
    const item = document.createElement("div");
    item.className = classNames("rehab-zone", `tone-${zone.tone}`);
    item.style.left = `${zone.x}%`;
    item.style.top = `${zone.y}%`;
    item.style.width = `${zone.w}%`;
    item.style.height = `${zone.h}%`;
    item.style.setProperty("--zone-color", toneColors[zone.tone] || toneColors.caution);
    item.innerHTML = `<span>${zone.label}</span>`;
    elements.rehabScene.append(item);
  });

  plan.phases.forEach((phase) => {
    const row = document.createElement("div");
    row.className = "rehab-step";
    row.innerHTML = `<strong>${phase.name}</strong><span>${phase.status}</span><p>${phase.detail}</p>`;
    elements.rehabPlanList.append(row);
  });
}

function renderVoice() {
  elements.voiceState.textContent = state.voiceState;
  elements.voiceTranscript.textContent = state.voiceTranscript;
  elements.voiceResponse.textContent = state.voiceResponse;
  elements.voiceButton.classList.toggle("is-listening", state.isListening);
  elements.voiceButton.setAttribute("aria-pressed", String(state.isListening));
  elements.speakButton.classList.toggle("is-speaking", state.isSpeaking);
  elements.stopVoiceButton.disabled = !state.isSpeaking && !state.isListening;
  renderActionLog();
}

function renderQuickCommands() {
  const commands = [
    ["Brief", "briefing"],
    ["Analyze image", "analyze frame"],
    ["Run Arize", "run arize failure analysis"],
    ["Dispatch", "dispatch team"],
    ["Close route", "close route"],
    ["Report", "create report"]
  ];
  elements.quickCommands.innerHTML = "";
  commands.forEach(([label, command]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.addEventListener("click", () => executeCommand(command));
    elements.quickCommands.append(button);
  });
}

function renderActionLog() {
  elements.actionLog.innerHTML = "";
  state.actionLog.slice(0, 5).forEach((item) => {
    const row = document.createElement("span");
    row.textContent = item;
    elements.actionLog.append(row);
  });
}

function addActionLog(message) {
  const time = new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date());
  state.actionLog = [`${time} · ${message}`, ...state.actionLog].slice(0, 8);
  renderActionLog();
}

function renderAll() {
  renderMission();
  renderMissionRun();
  renderLiveData();
  renderFrameList();
  renderSelectedFrame();
  renderOperations();
  renderRehabilitationPlan();
  renderVoice();
  renderArizeCvTelemetry();
  renderIntegrations();
  renderMcpWorkflow();
  renderArtifacts();
  renderTrace();
  renderClusters();
  renderEvals();
}

async function analyzeSelectedFrame() {
  elements.analyzeButton.disabled = true;
  elements.analyzeButton.textContent = "Analyzing...";
  try {
    if (state.selectedFrame.id === "upload" && state.uploadPayload) {
      const result = await fetchJson("/api/analyze-upload", {
        method: "POST",
        body: JSON.stringify(state.uploadPayload)
      });
      state.selectedFrame = buildUploadedFrame({
        fileName: state.uploadPayload.fileName,
        imageUrl: state.uploadUrl,
        result
      });
      state.trace = {
        traceId: result.traceId,
        spans: result.analysis.traceSpans || []
      };
      state.cvTelemetry = result.arizeCv || null;
      state.geminiPlan = null;
      state.agentBuilderRun = null;
      addActionLog(`Re-analyzed ${state.uploadPayload.fileName}; Gemini mode ${result.mode}.`);
      renderAll();
      refreshCvTelemetry().catch((error) => console.warn("Arize CV telemetry failed", error));
      return;
    }

    const result = await fetchJson("/api/analyze", {
      method: "POST",
      body: JSON.stringify({ frameId: state.selectedFrame.id, frame: state.selectedFrame })
    });
    state.trace = result.trace;
    state.selectedFrame = {
      ...state.selectedFrame,
      analysis: result.analysis
    };
    addActionLog(`Analyzed ${state.selectedFrame.location}; Phoenix trace ${result.trace.traceId.slice(0, 8)} created.`);
    renderAll();
    refreshCvTelemetry().catch((error) => console.warn("Arize CV telemetry failed", error));
  } finally {
    elements.analyzeButton.disabled = false;
    elements.analyzeButton.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>
      Analyze frame
    `;
  }
}

async function runImprovement() {
  elements.improveButton.disabled = true;
  elements.improveButton.textContent = "Improving...";
  try {
    const result = await fetchJson("/api/improve", {
      method: "POST",
      body: JSON.stringify({ frameId: state.selectedFrame.id, frame: state.selectedFrame })
    });
    state.improved = true;
    state.trace = {
      traceId: result.traceId,
      spans: result.traceSpans
    };
    if (result.artifact) {
      state.artifacts = [result.artifact, ...state.artifacts.filter((item) => item.id !== result.artifact.id)];
    }
    addActionLog(`Improvement loop completed for ${state.selectedFrame.location}.`);
    state.cvTelemetry = null;
    elements.evalDelta.textContent = "+17 recall";
    elements.improvementPatch.innerHTML = `
      <strong>${result.summary}</strong>
      <ul>${result.patch.map((item) => `<li>${item}</li>`).join("")}</ul>
    `;
    renderTrace();
    renderEvals();
    refreshCvTelemetry().catch((error) => console.warn("Arize CV telemetry failed", error));
  } finally {
    elements.improveButton.disabled = false;
    elements.improveButton.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 12a8 8 0 0 1 13.7-5.7" />
        <path d="M18 3v4h-4" />
        <path d="M20 12a8 8 0 0 1-13.7 5.7" />
        <path d="M6 21v-4h4" />
      </svg>
      Run improvement
    `;
  }
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function analyzeUpload(file) {
  const dataUrl = await readFileAsDataUrl(file);
  const [, payload] = dataUrl.split(",");
  state.uploadPayload = {
    fileName: file.name,
    mimeType: file.type,
    imageBase64: payload
  };
  const result = await fetchJson("/api/analyze-upload", {
    method: "POST",
    body: JSON.stringify(state.uploadPayload)
  });

  if (state.uploadUrl) {
    URL.revokeObjectURL(state.uploadUrl);
  }
  state.uploadUrl = URL.createObjectURL(file);
  const uploadFrame = buildUploadedFrame({
    fileName: file.name,
    imageUrl: state.uploadUrl,
    result
  });

  state.selectedFrame = uploadFrame;
  state.trace = {
    traceId: result.traceId,
    spans: result.analysis.traceSpans || []
  };
  state.cvTelemetry = result.arizeCv || null;
  state.geminiPlan = null;
  state.agentBuilderRun = null;
  addActionLog(`Uploaded ${file.name}; Gemini mode ${result.mode}.`);
  renderAll();
  refreshCvTelemetry().catch((error) => console.warn("Arize CV telemetry failed", error));
}

function buildUploadedFrame({ fileName, imageUrl, result }) {
  return {
    id: "upload",
    title: fileName,
    location: "Uploaded frame",
    cropClass: "",
    condition: result.mode === "gemini" ? "Live Gemini analysis" : "Demo analysis",
    severity: result.analysis.riskScore >= 85 ? "critical" : "high",
    confidence: 0.76,
    drift: "nearest Arize embedding cluster",
    labels: ["uploaded", result.mode],
    imageUrl,
    detections: result.analysis.detections || [],
    analysis: result.analysis
  };
}

function buildBriefing() {
  const frame = state.selectedFrame;
  const sector = getActiveSector();
  const sectorText = sector ? `${sector.name}, unit ${sector.unit}, ETA ${sector.eta}` : frame.location;
  return `${sectorText}. Risk score ${frame.analysis.riskScore}. ${frame.analysis.summary} Recommended action: ${frame.analysis.recommendation}`;
}

function getBrowserVoices(timeoutMs = 900) {
  if (!("speechSynthesis" in window)) {
    return Promise.resolve([]);
  }

  const voices = window.speechSynthesis.getVoices();
  if (voices.length) {
    return Promise.resolve(voices);
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) {
        return;
      }
      settled = true;
      window.speechSynthesis.removeEventListener?.("voiceschanged", finish);
      resolve(window.speechSynthesis.getVoices());
    };
    window.speechSynthesis.addEventListener?.("voiceschanged", finish, { once: true });
    window.speechSynthesis.onvoiceschanged = finish;
    setTimeout(finish, timeoutMs);
  });
}

async function pickBestBrowserVoice() {
  const voices = await getBrowserVoices();
  const preferredNames = ["Samantha", "Google US English", "Microsoft Jenny", "Karen", "Alex", "Daniel"];
  return (
    preferredNames.map((name) => voices.find((voice) => voice.name.includes(name))).find(Boolean) ||
    voices.find((voice) => voice.lang?.startsWith("en") && voice.localService) ||
    voices.find((voice) => voice.lang?.startsWith("en")) ||
    voices[0] ||
    null
  );
}

function splitSpeechText(text, maxLength = 220) {
  const cleanText = String(text || "").replace(/\s+/g, " ").trim();
  if (!cleanText) {
    return [];
  }

  const sentences = cleanText.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [cleanText];
  const chunks = [];
  let current = "";

  sentences.forEach((sentence) => {
    const next = sentence.trim();
    if (!next) {
      return;
    }
    if (`${current} ${next}`.trim().length <= maxLength) {
      current = `${current} ${next}`.trim();
      return;
    }
    if (current) {
      chunks.push(current);
    }
    if (next.length <= maxLength) {
      current = next;
      return;
    }
    for (let index = 0; index < next.length; index += maxLength) {
      chunks.push(next.slice(index, index + maxLength).trim());
    }
    current = "";
  });

  if (current) {
    chunks.push(current);
  }
  return chunks;
}

function speakBrowserChunk(chunk, voice, requestId) {
  return new Promise((resolve) => {
    if (requestId !== state.speechRequestId) {
      resolve(false);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(chunk);
    if (voice) {
      utterance.voice = voice;
    }
    utterance.rate = 0.92;
    utterance.pitch = 0.98;
    utterance.volume = 0.95;

    let settled = false;
    const watchdogMs = Math.min(22000, Math.max(4500, chunk.length * 85));
    const watchdog = setTimeout(() => finish(false), watchdogMs);

    function finish(ok) {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(watchdog);
      resolve(ok);
    }

    utterance.onstart = () => window.speechSynthesis.resume();
    utterance.onend = () => finish(true);
    utterance.onerror = () => finish(false);

    window.speechSynthesis.speak(utterance);
    setTimeout(() => window.speechSynthesis.resume(), 120);
  });
}

function stopSpeaking(options = {}) {
  state.speechRequestId += 1;
  if (state.speechAbortController) {
    state.speechAbortController.abort();
    state.speechAbortController = null;
  }
  if (state.currentAudio) {
    state.currentAudio.pause();
    state.currentAudio = null;
  }
  if (state.currentAudioUrl) {
    URL.revokeObjectURL(state.currentAudioUrl);
    state.currentAudioUrl = null;
  }
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
  state.isSpeaking = false;
  if (options.updateState) {
    state.voiceState = state.isListening ? "Listening" : "Ready";
    renderVoice();
  }
}

function isRecoverableTtsError(error) {
  return /429|quota|browser_speech|tts is unavailable|tts quota|play\(\) failed/i.test(String(error?.message || error || ""));
}

function rememberBrowserTtsFallback(minutes = 15) {
  state.preferBrowserTts = true;
  try {
    localStorage.setItem("rescuelens-tts-fallback-until", String(Date.now() + minutes * 60 * 1000));
  } catch {
    // Local storage can be disabled in some browser privacy modes.
  }
}

async function speakWithBrowser(text, requestId, modeLabel = "Browser voice") {
  if (!("speechSynthesis" in window)) {
    return false;
  }

  window.speechSynthesis.cancel();
  const chunks = splitSpeechText(text);
  const voice = await pickBestBrowserVoice();
  if (requestId !== state.speechRequestId) {
    return false;
  }

  state.isSpeaking = true;
  state.voiceState = modeLabel;
  renderVoice();

  let completed = false;
  for (const chunk of chunks) {
    const ok = await speakBrowserChunk(chunk, voice, requestId);
    if (!ok || requestId !== state.speechRequestId) {
      break;
    }
    completed = true;
  }

  if (requestId === state.speechRequestId) {
    state.isSpeaking = false;
    state.voiceState = state.isListening ? "Listening" : completed ? "Ready" : "Audio unavailable";
    renderVoice();
  }
  return true;
}

async function speak(text) {
  const requestId = state.speechRequestId + 1;
  stopSpeaking();
  state.speechRequestId = requestId;
  state.speechAbortController = new AbortController();
  state.isSpeaking = true;
  state.voiceState = state.preferBrowserTts ? "Browser voice" : "Preparing Gemini audio";
  renderVoice();

  if (state.preferBrowserTts) {
    await speakWithBrowser(text, requestId);
    return;
  }

  try {
    const response = await fetch("/api/tts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
      signal: state.speechAbortController.signal
    });

    if (requestId !== state.speechRequestId) {
      return;
    }

    if (!response.ok) {
      const errorText = await response.text();
      const error = new Error(errorText);
      error.status = response.status;
      throw error;
    }

    const audioBlob = await response.blob();
    if (requestId !== state.speechRequestId) {
      return;
    }
    state.currentAudioUrl = URL.createObjectURL(audioBlob);
    state.currentAudio = new Audio(state.currentAudioUrl);
    state.voiceState = "Gemini voice";
    renderVoice();
    state.currentAudio.onended = () => {
      if (requestId === state.speechRequestId) {
        state.isSpeaking = false;
        state.voiceState = state.isListening ? "Listening" : "Ready";
        renderVoice();
      }
    };
    state.currentAudio.onerror = state.currentAudio.onended;
    await state.currentAudio.play();
    return;
  } catch (error) {
    if (error?.name === "AbortError" || requestId !== state.speechRequestId) {
      return;
    }
    console.warn("Gemini TTS unavailable; using browser voice", error);
    if (isRecoverableTtsError(error)) {
      rememberBrowserTtsFallback();
    }
    const spoke = await speakWithBrowser(text, requestId);
    if (!spoke && requestId === state.speechRequestId) {
      state.isSpeaking = false;
      state.voiceState = "Audio unavailable";
      renderVoice();
    }
  } finally {
    if (requestId === state.speechRequestId) {
      state.speechAbortController = null;
    }
  }
}

function setVoiceResponse(command, response, shouldSpeak = true) {
  state.voiceTranscript = command;
  state.voiceResponse = response;
  state.voiceState = shouldSpeak ? "Preparing audio" : state.isListening ? "Listening" : "Ready";
  renderVoice();
  if (shouldSpeak) {
    speak(response).catch((error) => console.warn("Speech playback failed", error));
  }
}

function selectRelativeFrame(direction) {
  const frames = state.mission.frames;
  const currentIndex = Math.max(
    0,
    frames.findIndex((frame) => frame.id === state.selectedFrame.id)
  );
  const nextIndex = (currentIndex + direction + frames.length) % frames.length;
  selectFrame(frames[nextIndex]);
  return frames[nextIndex];
}

function selectFrameFromCommand(command) {
  const lower = command.toLowerCase();
  if (lower.includes("roof") || lower.includes("a7") || lower.includes("survivor")) {
    return getFrameById("roof-01");
  }
  if (lower.includes("road") || lower.includes("route") || lower.includes("west")) {
    return getFrameById("road-02");
  }
  if (lower.includes("fire") || lower.includes("smoke") || lower.includes("ridge")) {
    return getFrameById("fire-03");
  }
  if (lower.includes("bridge") || lower.includes("mill")) {
    return getFrameById("bridge-04");
  }
  return null;
}

function updateActiveSectorStatus(status, unit) {
  const sector = getActiveSector();
  if (!sector) {
    return null;
  }
  sector.status = status;
  if (unit) {
    sector.unit = unit;
  }
  renderOperations();
  return sector;
}

async function requestAgentPlan(command) {
  const result = await fetchJson("/api/agent-command", {
    method: "POST",
    body: JSON.stringify({
      command,
      selectedFrameId: state.selectedFrame.id,
      selectedFrame: state.selectedFrame,
      trace: state.trace
    })
  });
  return result.plan;
}

async function refreshIntegrations() {
  state.integrations = await fetchJson("/api/integrations");
  renderIntegrations();
}

async function refreshSubmissionReadiness() {
  state.submissionReadiness = await fetchJson("/api/submission-readiness");
  renderIntegrations();
}

async function refreshArtifacts() {
  const result = await fetchJson("/api/artifacts");
  state.artifacts = result.artifacts || [];
  renderArtifacts();
  renderMissionRun();
}

async function refreshCvTelemetry() {
  if (!state.selectedFrame) {
    return;
  }
  const requestId = state.cvTelemetryRequestId + 1;
  state.cvTelemetryRequestId = requestId;
  const frame = state.selectedFrame;
  const result = await fetchJson("/api/arize/cv-observability", {
    method: "POST",
    body: JSON.stringify({
      frameId: frame.id,
      frame,
      trace: state.trace
    })
  });
  if (requestId !== state.cvTelemetryRequestId || state.selectedFrame.id !== frame.id) {
    return;
  }
  state.cvTelemetry = result;
  renderSelectedFrame();
  renderOperations();
  renderRehabilitationPlan();
  renderArizeCvTelemetry();
  renderMissionRun();
}

async function refreshLiveData() {
  elements.refreshLiveDataButton.disabled = true;
  elements.refreshLiveDataButton.textContent = "Loading live data...";
  try {
    state.liveData = await fetchJson("/api/live-data");
    state.locationSearch = null;
    const stillAvailable = state.liveData.events.find((event) => event.id === state.selectedLiveEvent?.id);
    if (stillAvailable) {
      setLiveEventContext(stillAvailable);
    } else if (!state.hasAutoSelectedLive) {
      state.hasAutoSelectedLive = setLiveEventContext(pickDefaultLiveEvent(state.liveData.events));
    }
    renderAll();
    refreshCvTelemetry().catch((error) => console.warn("Arize CV telemetry failed", error));
  } finally {
    elements.refreshLiveDataButton.disabled = false;
    elements.refreshLiveDataButton.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 12a8 8 0 0 1 13.7-5.7" />
        <path d="M18 3v4h-4" />
        <path d="M20 12a8 8 0 0 1-13.7 5.7" />
        <path d="M6 21v-4h4" />
      </svg>
      Refresh live data
    `;
  }
}

async function searchLocation(query) {
  const cleanQuery = query.trim();
  if (!cleanQuery) {
    state.locationSearch = null;
    renderLiveData();
    return;
  }

  elements.locationSearchResult.textContent = "Searching location and live incidents...";
  const result = await fetchJson(`/api/location-search?q=${encodeURIComponent(cleanQuery)}`);
  state.locationSearch = result;
  state.liveData = result.liveData;
  if (!result.place) {
    elements.locationSearchResult.innerHTML = `<strong>No location found</strong> for ${escapeHtml(cleanQuery)}`;
  } else if (setLiveEventContext(pickDefaultLiveEvent(result.nearestEvents))) {
    state.hasAutoSelectedLive = true;
    addActionLog(`Location search focused ${result.place.name} and selected the nearest live incident.`);
  }
  renderAll();
  refreshCvTelemetry().catch((error) => console.warn("Arize CV telemetry failed", error));
}

async function runArizeWorkflow() {
  elements.arizeWorkflowButton.disabled = true;
  elements.arizeWorkflowButton.textContent = "Running MCP...";
  try {
    const workflow = await fetchJson("/api/arize/failure-analysis", {
      method: "POST",
      body: JSON.stringify({
        frameId: state.selectedFrame.id,
        frame: state.selectedFrame,
        trace: state.trace
      })
    });
    state.mcpWorkflow = workflow;
    state.trace = {
      traceId: workflow.traceId || state.trace?.traceId || "arize-mcp",
      spans: workflow.tools.map((tool) => ({
        name: tool.name,
        latencyMs: 0,
        status: tool.status,
        output: tool.output,
        arize: "phoenix_mcp"
      }))
    };
    addActionLog(`Arize MCP workflow analyzed ${workflow.failureSlice.name}.`);
    renderMcpWorkflow();
    renderTrace();
    renderMissionRun();
    refreshCvTelemetry().catch((error) => console.warn("Arize CV telemetry failed", error));
  } finally {
    elements.arizeWorkflowButton.disabled = false;
    elements.arizeWorkflowButton.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3v18" />
        <path d="m5 10 7-7 7 7" />
        <path d="M5 21h14" />
      </svg>
      Run MCP loop
    `;
  }
}

async function createActionArtifact(type, routeId) {
  const result = await fetchJson("/api/artifacts", {
    method: "POST",
    body: JSON.stringify({
      type,
      routeId,
      frameId: state.selectedFrame.id,
      frame: state.selectedFrame,
      trace: state.trace,
      actionLog: state.actionLog,
      cvTelemetry: state.cvTelemetry
    })
  });
  state.artifacts = result.artifacts || [result.artifact, ...state.artifacts];
  addActionLog(`Created ${result.artifact.type}: ${result.artifact.title}.`);
  renderArtifacts();
  renderMissionRun();
  return result.artifact;
}

async function saveSafetyPlan() {
  elements.savePlanButton.disabled = true;
  elements.savePlanButton.textContent = "Saving...";
  try {
    if (!state.cvTelemetry || state.cvTelemetry.frameId !== state.selectedFrame.id) {
      await refreshCvTelemetry();
    }
    const artifact = await createActionArtifact("safety_plan");
    addActionLog(`Saved safety-road and rehabilitation plan for ${state.selectedFrame.location}.`);
    return artifact;
  } finally {
    elements.savePlanButton.disabled = false;
    elements.savePlanButton.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" />
        <path d="M17 21v-8H7v8" />
        <path d="M7 3v5h8" />
      </svg>
      Save plan
    `;
  }
}

async function runGeminiJudgePlan() {
  try {
    const plan = await requestAgentPlan(
      "Brief this incident, check model risk with Arize, and prepare a human-approved response handoff."
    );
    state.geminiPlan = plan;
    addActionLog(`Gemini command planner returned ${plan.action}.`);
    setVoiceResponse(
      "Gemini judge plan",
      plan.spokenResponse || "Gemini produced the supervised response plan.",
      false
    );
    renderIntegrations();
    renderMissionRun();
    return plan;
  } catch (error) {
    console.warn("Gemini judge plan failed", error);
    state.geminiPlan = {
      error: error instanceof Error ? error.message : "Gemini command planner failed"
    };
    addActionLog("Gemini command planner needs API access; fallback UI remains available.");
    renderIntegrations();
    renderMissionRun();
    return null;
  }
}

async function invokeAgentBuilderRuntime() {
  const result = await fetchJson("/api/agent-builder/invoke", {
    method: "POST",
    body: JSON.stringify({
      frameId: state.selectedFrame.id,
      frame: state.selectedFrame,
      trace: state.trace,
      mcpWorkflow: state.mcpWorkflow
    })
  });
  state.agentBuilderRun = result;
  addActionLog(
    result.called
      ? `Agent Builder interaction completed for ${result.agent}.`
      : `Agent Builder proof needs live auth: ${result.mode}.`
  );
  renderIntegrations();
  renderMissionRun();
  return result;
}

async function runDemoSequence() {
  if (state.demoRunning) {
    return;
  }

  state.demoRunning = true;
  state.demoStatus = "Running";
  renderMissionRun();
  addActionLog("Judge demo started: live incident to Gemini to Arize to approved report.");
  setVoiceResponse(
    "Run judge demo",
    "Starting the supervised mission run: incident selection, drone evidence, Gemini planning, Arize CV review, and a human-approved report.",
    false
  );

  try {
    if (!state.liveData) {
      await refreshLiveData();
    }

    if (!state.selectedLiveEvent && state.liveData?.events?.length) {
      const event = pickDefaultLiveEvent(state.liveData.events);
      if (setLiveEventContext(event)) {
        addActionLog(`Judge demo selected ${event.title} from ${event.source}.`);
        renderAll();
      }
    }

    state.demoStatus = "Arize CV";
    renderMissionRun();
    await refreshCvTelemetry();

    state.demoStatus = "Gemini";
    renderMissionRun();
    await analyzeSelectedFrame();
    await runGeminiJudgePlan();

    state.demoStatus = "Arize MCP";
    renderMissionRun();
    await runArizeWorkflow();

    state.demoStatus = "Agent Builder";
    renderMissionRun();
    await invokeAgentBuilderRuntime();
    refreshSubmissionReadiness().catch((error) => console.warn("Submission readiness failed", error));

    state.demoStatus = "Report";
    renderMissionRun();
    await createActionArtifact("mission_report");

    state.demoStatus = "Complete";
    addActionLog("Judge demo completed: report artifact is ready for human approval.");
    setVoiceResponse(
      "Run judge demo",
      "Mission run complete. Gemini produced the response plan, Arize checked CV failure coverage, and the human-approved mission report is ready.",
      false
    );
  } catch (error) {
    console.error(error);
    state.demoStatus = "Needs review";
    addActionLog("Judge demo stopped before completion; check integration status.");
    setVoiceResponse(
      "Run judge demo",
      "The mission run stopped before completion. Check live feed, Gemini, or Arize integration status, then rerun the demo.",
      false
    );
  } finally {
    state.demoRunning = false;
    renderAll();
  }
}

async function applyAgentPlan(plan, command, shouldSpeak, commandId) {
  if (commandId && commandId !== state.commandRequestId) {
    return;
  }

  const targetFrame = plan.targetFrameId ? getFrameById(plan.targetFrameId) : null;
  if (targetFrame) {
    selectFrame(targetFrame);
  }

  const action = String(plan.action || "none").toLowerCase();
  if (action === "next_sector") {
    selectRelativeFrame(1);
  } else if (action === "previous_sector") {
    selectRelativeFrame(-1);
  } else if (action === "analyze") {
    await analyzeSelectedFrame();
  } else if (action === "improve") {
    await runImprovement();
  } else if (action === "arize_failure_analysis") {
    await runArizeWorkflow();
  } else if (action === "create_report") {
    await createActionArtifact("mission_report");
  } else if (action === "dispatch") {
    updateActiveSectorStatus(plan.sectorStatus || "Dispatched", getActiveSector()?.unit);
    await createActionArtifact(plan.artifactType || "dispatch_task");
  } else if (action === "close_route") {
    updateActiveSectorStatus(plan.sectorStatus || "Closed", "Traffic control");
    const route = state.mission.operations.routes.find((item) => item.id === (plan.routeId || "west-service"));
    if (route) {
      route.status = plan.routeStatus || "Closed";
      route.eta = "Hold";
      route.tone = "danger";
    }
    renderOperations();
    await createActionArtifact(plan.artifactType || "route_closure", route?.id || "west-service");
  } else if (action === "evacuate") {
    updateActiveSectorStatus(plan.sectorStatus || "Evacuate", "Evac team");
    await createActionArtifact(plan.artifactType || "dispatch_task");
  }

  if (plan.actionLog) {
    addActionLog(plan.actionLog);
  }
  if (commandId && commandId !== state.commandRequestId) {
    return;
  }
  setVoiceResponse(command, plan.spokenResponse || buildBriefing(), shouldSpeak);
}

async function executeLocalFallback(command, shouldSpeak, commandId) {
  if (commandId && commandId !== state.commandRequestId) {
    return;
  }

  const lower = command.toLowerCase();
  const requestedFrame = selectFrameFromCommand(lower);
  if (requestedFrame) {
    selectFrame(requestedFrame);
    if (commandId && commandId !== state.commandRequestId) {
      return;
    }
    setVoiceResponse(command, `${requestedFrame.title} is now selected. ${requestedFrame.analysis.recommendation}`, shouldSpeak);
    return;
  }
  if (lower.includes("next")) {
    const frame = selectRelativeFrame(1);
    if (commandId && commandId !== state.commandRequestId) {
      return;
    }
    setVoiceResponse(command, `${frame.title} is now selected.`, shouldSpeak);
    return;
  }
  if (lower.includes("save plan") || lower.includes("safety plan")) {
    await saveSafetyPlan();
    if (commandId && commandId !== state.commandRequestId) {
      return;
    }
    setVoiceResponse(command, "Safety-road and rehabilitation plan saved for human approval.", shouldSpeak);
    return;
  }
  if (lower.includes("brief") || lower.includes("status") || lower.includes("report")) {
    setVoiceResponse(command, buildBriefing(), shouldSpeak);
    return;
  }
  setVoiceResponse(
    command,
    `I could not reach Gemini for a live agent response. Current sector: ${state.selectedFrame.location}. ${state.selectedFrame.analysis.recommendation}`,
    shouldSpeak
  );
}

async function executeCommand(command, shouldSpeak = true) {
  const cleanCommand = command.trim();
  if (!cleanCommand) {
    return;
  }
  const commandId = state.commandRequestId + 1;
  state.commandRequestId = commandId;
  stopSpeaking();

  if (cleanCommand.toLowerCase() === "stop") {
    state.voiceTranscript = cleanCommand;
    state.voiceResponse = "Voice stopped.";
    state.voiceState = "Ready";
    renderVoice();
    return;
  }

  state.voiceTranscript = cleanCommand;
  state.voiceResponse = "Thinking with Gemini...";
  state.voiceState = "Planning";
  renderVoice();

  try {
    const plan = await requestAgentPlan(cleanCommand);
    if (commandId !== state.commandRequestId) {
      return;
    }
    await applyAgentPlan(plan, cleanCommand, shouldSpeak, commandId);
  } catch (error) {
    if (commandId !== state.commandRequestId) {
      return;
    }
    console.warn("Gemini voice agent unavailable; using local fallback", error);
    await executeLocalFallback(cleanCommand, shouldSpeak, commandId);
  }
}

function setupVoiceRecognition() {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) {
    state.voiceState = "Typed mode";
    state.voiceTranscript = "Microphone unavailable";
    state.voiceResponse = "Speech input is unavailable in this browser; typed commands are active.";
    renderVoice();
    return;
  }

  const recognition = new Recognition();
  recognition.lang = "en-US";
  recognition.interimResults = true;
  recognition.continuous = false;
  recognition.maxAlternatives = 1;
  recognition.onstart = () => {
    state.isListening = true;
    state.hasFinalRecognitionResult = false;
    state.lastRecognizedTranscript = "";
    state.voiceState = "Listening";
    state.voiceTranscript = "Listening...";
    state.voiceResponse = "Speak a short incident command.";
    renderVoice();
  };
  recognition.onend = () => {
    state.isListening = false;
    if (!state.hasFinalRecognitionResult && state.voiceState === "Listening") {
      state.voiceState = "Ready";
      state.voiceTranscript = state.lastRecognizedTranscript || "No command heard";
      state.voiceResponse = "Try again or type a command.";
    }
    renderVoice();
  };
  recognition.onerror = (event) => {
    state.isListening = false;
    state.voiceState = event.error === "not-allowed" ? "Mic blocked" : "Typed mode";
    state.voiceTranscript = event.error === "no-speech" ? "No command heard" : "Speech stopped";
    state.voiceResponse =
      event.error === "not-allowed"
        ? "Microphone permission is blocked; typed commands are active."
        : "Speech capture stopped; typed commands are still active.";
    renderVoice();
  };
  recognition.onresult = (event) => {
    let finalTranscript = "";
    let interimTranscript = "";
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index];
      const transcript = result?.[0]?.transcript || "";
      if (result?.isFinal) {
        finalTranscript += transcript;
      } else {
        interimTranscript += transcript;
      }
    }

    const heard = (finalTranscript || interimTranscript).trim();
    if (heard) {
      state.lastRecognizedTranscript = heard;
      state.voiceTranscript = heard;
      state.voiceResponse = finalTranscript ? "Planning response..." : "Listening...";
      state.voiceState = finalTranscript ? "Planning" : "Listening";
      renderVoice();
    }

    const cleanFinal = finalTranscript.trim();
    if (cleanFinal) {
      state.hasFinalRecognitionResult = true;
      executeCommand(cleanFinal);
    }
  };
  state.recognition = recognition;
}

function startVoiceCapture() {
  if (!state.recognition) {
    setupVoiceRecognition();
  }
  if (!state.recognition || state.isListening) {
    if (state.isListening) {
      state.recognition.stop();
    }
    return;
  }

  stopSpeaking();
  state.recognitionSessionId += 1;
  state.hasFinalRecognitionResult = false;
  state.lastRecognizedTranscript = "";
  state.voiceState = "Listening";
  state.voiceTranscript = "Listening...";
  state.voiceResponse = "Speak a short incident command.";
  renderVoice();

  try {
    state.recognition.start();
  } catch (error) {
    console.warn("Speech recognition start failed", error);
    state.isListening = false;
    state.voiceState = "Typed mode";
    state.voiceTranscript = "Speech unavailable";
    state.voiceResponse = "Type a command or use quick commands.";
    renderVoice();
  }
}

function stopVoiceInteraction() {
  if (state.recognition && state.isListening) {
    state.recognition.stop();
  }
  stopSpeaking({ updateState: false });
  state.isListening = false;
  state.voiceState = "Ready";
  state.voiceResponse = "Voice stopped.";
  renderVoice();
}

function readCurrentBriefing() {
  if (state.recognition && state.isListening) {
    state.recognition.stop();
  }
  const currentResponse = String(state.voiceResponse || "").trim();
  const text =
    currentResponse && !["Thinking with Gemini...", "Choose a quick command, type, or tap Speak."].includes(currentResponse)
      ? currentResponse
      : buildBriefing();
  state.voiceTranscript = "Read briefing";
  state.voiceResponse = text;
  renderVoice();
  speak(text).catch((error) => console.warn("Speech playback failed", error));
}

function setupSectionNav() {
  const links = [...document.querySelectorAll("[data-nav-section]")];
  const nav = document.querySelector(".section-nav");
  const topbar = document.querySelector(".topbar");
  const sections = links.map((link) => document.querySelector(link.getAttribute("href"))).filter(Boolean);
  if (!links.length || !sections.length) {
    return;
  }

  function centerNavLink(link) {
    if (!nav || !link) {
      return;
    }

    const left = link.offsetLeft - nav.clientWidth / 2 + link.clientWidth / 2;
    nav.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
  }

  function scrollToSection(section) {
    const topbarHeight = topbar?.offsetHeight || 82;
    const top = Math.max(0, section.getBoundingClientRect().top + window.scrollY - topbarHeight - 14);
    window.scrollTo({ top, behavior: "smooth" });
  }

  function setActiveSection(sectionId, options = {}) {
    links.forEach((link) => {
      const isActive = link.dataset.navSection === sectionId;
      link.classList.toggle("is-active", isActive);
      if (isActive) {
        link.setAttribute("aria-current", "true");
        if (options.centerNav !== false) {
          centerNavLink(link);
        }
      } else {
        link.removeAttribute("aria-current");
      }
    });
  }

  links.forEach((link) => {
    link.addEventListener("click", (event) => {
      const target = document.querySelector(link.getAttribute("href"));
      if (!target) {
        return;
      }

      event.preventDefault();
      setActiveSection(link.dataset.navSection);
      scrollToSection(target);
      history.replaceState(null, "", `#${target.id}`);
    });
  });

  if (window.location.hash) {
    const initialSection = document.querySelector(window.location.hash);
    if (initialSection) {
      setTimeout(() => {
        setActiveSection(initialSection.id);
        scrollToSection(initialSection);
      }, 120);
    }
  }

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible?.target?.id) {
          setActiveSection(visible.target.id, { centerNav: false });
        }
      },
      {
        rootMargin: "-18% 0px -66% 0px",
        threshold: [0.12, 0.24, 0.4, 0.58]
      }
    );
    sections.forEach((section) => observer.observe(section));
    return;
  }

  window.addEventListener(
    "scroll",
    () => {
      const current = sections
        .map((section) => ({ section, distance: Math.abs(section.getBoundingClientRect().top - 110) }))
        .sort((a, b) => a.distance - b.distance)[0]?.section;
      if (current?.id) {
        setActiveSection(current.id, { centerNav: false });
      }
    },
    { passive: true }
  );
}

elements.analyzeButton.addEventListener("click", analyzeSelectedFrame);
elements.improveButton.addEventListener("click", runImprovement);
elements.runDemoButton.addEventListener("click", () => runDemoSequence().catch(console.error));
elements.demoAnalyzeButton.addEventListener("click", () => analyzeSelectedFrame().catch(console.error));
elements.demoArizeButton.addEventListener("click", () => runArizeWorkflow().catch(console.error));
elements.demoReportButton.addEventListener("click", () => createActionArtifact("mission_report").catch(console.error));
elements.uploadButton.addEventListener("click", () => elements.fileInput.click());
elements.stageUploadButton.addEventListener("click", () => elements.fileInput.click());
elements.refreshLiveDataButton.addEventListener("click", () => refreshLiveData().catch(console.error));
elements.locationSearchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  searchLocation(elements.locationSearchInput.value).catch((error) => {
    console.error(error);
    elements.locationSearchResult.textContent = "Location search failed. Check server logs or network access.";
  });
});
elements.refreshIntegrationsButton.addEventListener("click", () => refreshIntegrations().catch(console.error));
elements.arizeWorkflowButton.addEventListener("click", () => runArizeWorkflow().catch(console.error));
elements.missionReportButton.addEventListener("click", () => createActionArtifact("mission_report").catch(console.error));
elements.savePlanButton.addEventListener("click", () => saveSafetyPlan().catch(console.error));
elements.speakButton.addEventListener("click", readCurrentBriefing);
elements.stopVoiceButton.addEventListener("click", stopVoiceInteraction);
elements.voiceButton.addEventListener("click", startVoiceCapture);
elements.voiceForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const command = elements.voiceCommandInput.value;
  elements.voiceCommandInput.value = "";
  executeCommand(command);
});
elements.fileInput.addEventListener("change", (event) => {
  const [file] = event.target.files || [];
  if (file) {
    analyzeUpload(file).catch((error) => {
      console.error(error);
      alert("Upload analysis failed. Check the server logs for details.");
    });
  }
});

const mission = await fetchJson("/api/mission");
state.mission = mission;
state.selectedFrame = mission.frames[0];
state.actionLog = mission.operations.actionLog;
await Promise.all([refreshIntegrations(), refreshSubmissionReadiness(), refreshArtifacts(), refreshLiveData()]);
setupVoiceRecognition();
setupSectionNav();
renderQuickCommands();
renderAll();
refreshCvTelemetry().catch((error) => console.warn("Arize CV telemetry failed", error));
