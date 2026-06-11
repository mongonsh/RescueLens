import { randomUUID } from "node:crypto";

const baseSpans = [
  {
    name: "gemini.vision.classify_scene",
    latencyMs: 842,
    status: "ok",
    input: "drone image + mission checklist",
    output: "flood_urban, urgent_review",
    arize: "image_classification"
  },
  {
    name: "cv.detect_objects",
    latencyMs: 391,
    status: "ok",
    input: "image embedding + visual prompt",
    output: "people, rooftops, roads, waterline",
    arize: "object_detection"
  },
  {
    name: "agent.rank_rescue_priority",
    latencyMs: 277,
    status: "warn",
    input: "detections + confidence + route graph",
    output: "human_review_required",
    arize: "trace_eval"
  },
  {
    name: "phoenix.mcp.find_similar_failures",
    latencyMs: 315,
    status: "ok",
    input: "low-light rooftop embedding",
    output: "18 similar frames, 7 prior misses",
    arize: "similarity_search"
  }
];

export const missionData = {
  mission: {
    name: "RescueLens",
    subtitle: "Self-improving disaster response computer vision agent",
    incident: "North Valley flood and wildfire evacuation",
    command: "Regional emergency operations center",
    lastUpdated: "Live demo",
    status: "Active triage",
    summary:
      "RescueLens reviews drone and field images, flags life-safety risks, and uses Arize Phoenix traces plus CV observability to learn from low-confidence failures."
  },
  metrics: {
    frames: 124,
    urgentFindings: 18,
    routesBlocked: 9,
    avgLatency: "1.8s",
    evalBefore: 71,
    evalAfter: 88,
    falseNegativeDrop: 43
  },
  frames: [
    {
      id: "roof-01",
      title: "Rooftop cluster",
      location: "Sector A7",
      cropClass: "crop-top-left",
      condition: "Flooded neighborhood",
      severity: "critical",
      confidence: 0.74,
      drift: "low-light water glare",
      labels: ["possible survivor", "floodwater", "roof access"],
      detections: [
        { label: "possible survivor", confidence: 0.72, box: [62, 19, 12, 11], tone: "danger" },
        { label: "safe roof edge", confidence: 0.81, box: [37, 42, 20, 13], tone: "safe" },
        { label: "flooded road", confidence: 0.94, box: [3, 63, 47, 22], tone: "water" }
      ],
      analysis: {
        summary:
          "Potential person-sized signal on a rooftop near deep floodwater. Confidence is below auto-dispatch threshold because glare and roof debris are visually similar.",
        riskScore: 92,
        recommendation: "Dispatch drone for second pass and alert boat team for Sector A7 standby.",
        evidence: ["Rooftop access visible", "Road network submerged", "Similar low-light misses found in Phoenix"],
        reviewReason: "Low confidence on small object detection"
      }
    },
    {
      id: "road-02",
      title: "Evacuation route blocked",
      location: "West service road",
      cropClass: "crop-top-right",
      condition: "Debris and stalled vehicles",
      severity: "high",
      confidence: 0.88,
      drift: "post-storm debris pattern",
      labels: ["blocked route", "vehicle", "debris"],
      detections: [
        { label: "blocked road", confidence: 0.91, box: [24, 51, 48, 17], tone: "danger" },
        { label: "vehicle", confidence: 0.84, box: [55, 37, 14, 10], tone: "caution" },
        { label: "debris field", confidence: 0.89, box: [18, 62, 35, 14], tone: "caution" }
      ],
      analysis: {
        summary:
          "Primary evacuation road is blocked by debris and at least one stalled vehicle. Route should be removed from responder navigation until verified clear.",
        riskScore: 81,
        recommendation: "Route ambulances through County Line Road and assign public works clearance.",
        evidence: ["Road obstruction spans both lanes", "Vehicle detected near debris", "No safe shoulder visible"],
        reviewReason: "Actionable route closure"
      }
    },
    {
      id: "fire-03",
      title: "Wildfire edge",
      location: "Ridgeline homes",
      cropClass: "crop-bottom-left",
      condition: "Smoke and structure exposure",
      severity: "critical",
      confidence: 0.83,
      drift: "smoke occlusion",
      labels: ["smoke", "structure risk", "evacuation priority"],
      detections: [
        { label: "smoke plume", confidence: 0.93, box: [6, 8, 58, 43], tone: "smoke" },
        { label: "exposed structures", confidence: 0.79, box: [52, 50, 24, 17], tone: "danger" },
        { label: "possible fireline", confidence: 0.76, box: [20, 63, 52, 10], tone: "danger" }
      ],
      analysis: {
        summary:
          "Smoke occlusion is increasing around ridgeline homes. The model flags structure exposure but requests human review before marking active flame boundaries.",
        riskScore: 89,
        recommendation: "Prioritize evacuation confirmation and request thermal pass if available.",
        evidence: ["Smoke plume expanding", "Structures at edge of visible plume", "Fireline confidence below threshold"],
        reviewReason: "Smoke reduces segmentation certainty"
      }
    },
    {
      id: "bridge-04",
      title: "Bridge washout",
      location: "Mill Creek crossing",
      cropClass: "crop-bottom-right",
      condition: "Damaged infrastructure",
      severity: "high",
      confidence: 0.86,
      drift: "new infrastructure damage",
      labels: ["bridge damage", "route loss", "landing zone"],
      detections: [
        { label: "road gap", confidence: 0.9, box: [42, 38, 24, 18], tone: "danger" },
        { label: "unsafe bridge edge", confidence: 0.85, box: [30, 53, 43, 11], tone: "danger" },
        { label: "possible landing zone", confidence: 0.78, box: [7, 17, 25, 18], tone: "safe" }
      ],
      analysis: {
        summary:
          "Bridge crossing appears washed out. RescueLens identifies a nearby flat area that may support drone supply drop staging after verification.",
        riskScore: 84,
        recommendation: "Mark crossing closed and send scout team to validate alternate staging zone.",
        evidence: ["Visible road discontinuity", "Damaged edge detected", "Nearby open area found"],
        reviewReason: "Infrastructure damage affects route planning"
      }
    }
  ],
  clusters: [
    { id: "baseline", label: "Clear daytime drone frames", x: 22, y: 31, count: 68, severity: "normal" },
    { id: "lowlight", label: "Low-light water glare", x: 71, y: 26, count: 18, severity: "critical" },
    { id: "smoke", label: "Smoke occlusion", x: 63, y: 68, count: 21, severity: "high" },
    { id: "debris", label: "New debris pattern", x: 34, y: 72, count: 17, severity: "high" }
  ],
  operations: {
    sectors: [
      {
        id: "sector-a7",
        frameId: "roof-01",
        label: "A7",
        name: "Rooftop cluster",
        status: "Rescue review",
        unit: "Boat 3",
        eta: "6 min",
        x: 34,
        y: 34,
        severity: "critical"
      },
      {
        id: "west-road",
        frameId: "road-02",
        label: "W2",
        name: "West service road",
        status: "Route blocked",
        unit: "Public works",
        eta: "14 min",
        x: 64,
        y: 55,
        severity: "high"
      },
      {
        id: "ridge-fire",
        frameId: "fire-03",
        label: "R4",
        name: "Ridgeline homes",
        status: "Evacuate",
        unit: "Air watch",
        eta: "4 min",
        x: 48,
        y: 77,
        severity: "critical"
      },
      {
        id: "mill-bridge",
        frameId: "bridge-04",
        label: "M1",
        name: "Mill Creek crossing",
        status: "Closed",
        unit: "Scout 2",
        eta: "11 min",
        x: 77,
        y: 28,
        severity: "high"
      }
    ],
    routes: [
      { id: "north-loop", label: "North Loop", status: "Open", eta: "12 min", tone: "safe" },
      { id: "west-service", label: "West Service", status: "Blocked", eta: "Hold", tone: "danger" },
      { id: "county-line", label: "County Line", status: "Reroute", eta: "18 min", tone: "caution" }
    ],
    actionLog: [
      "Phoenix trace opened for Sector A7 low-light review.",
      "County Line Road marked as ambulance reroute.",
      "Thermal pass requested over ridgeline homes."
    ]
  },
  evals: [
    { label: "Urgent frame recall", before: 71, after: 88 },
    { label: "Small object review capture", before: 58, after: 81 },
    { label: "Route closure precision", before: 84, after: 90 },
    { label: "Low-light false negatives", before: 37, after: 21, lowerIsBetter: true }
  ]
};

export function buildTraceForFrame(frameId) {
  const frame = missionData.frames.find((item) => item.id === frameId) || missionData.frames[0];
  const spans = baseSpans.map((span, index) => ({
    ...span,
    spanId: `${frame.id}-${index + 1}`,
    frameId: frame.id,
    timestamp: new Date(Date.now() - (baseSpans.length - index) * 450).toISOString()
  }));

  return {
    traceId: randomUUID(),
    frameId: frame.id,
    spans,
    rootCause:
      frame.id === "roof-01"
        ? "Embedding drift found a cluster of low-light rooftop frames where small human-like shapes were under-detected."
        : "Trace review confirms the finding is above the action threshold and should be routed to the mission queue.",
    arizeSignals: ["OpenInference trace", "CV embedding", "similarity search", "eval slice"]
  };
}

export function buildImprovementRun(frameId) {
  const traceId = randomUUID();
  return {
    traceId,
    frameId,
    summary:
      "RescueLens created a focused eval slice from 18 similar low-light frames, tightened the visual checklist, and raised human-review capture before auto-dispatch.",
    patch: [
      "Add low-light rooftop checklist to Gemini vision prompt",
      "Lower auto-review threshold for person-sized objects near roof edges",
      "Create Phoenix eval slice: low_light_water_glare",
      "Route any urgent frame below 0.82 confidence to responder review"
    ],
    metrics: {
      urgentFrameRecall: { before: 71, after: 88 },
      smallObjectReviewCapture: { before: 58, after: 81 },
      falseNegativeRate: { before: 37, after: 21 }
    },
    traceSpans: [
      {
        name: "phoenix.mcp.query_failed_traces",
        latencyMs: 251,
        status: "ok",
        output: "7 missed urgent frames"
      },
      {
        name: "arize.cv.embedding_similarity_search",
        latencyMs: 332,
        status: "ok",
        output: "18 matched low-light frames"
      },
      {
        name: "agent.generate_prompt_patch",
        latencyMs: 704,
        status: "ok",
        output: "4-line checklist patch"
      },
      {
        name: "eval.rerun_low_light_slice",
        latencyMs: 1188,
        status: "ok",
        output: "recall +17 points"
      }
    ]
  };
}

export function buildUploadAnalysis(fileName) {
  return {
    fileName,
    summary:
      "Demo analysis used because GEMINI_API_KEY is not configured. The uploaded frame is treated as a disaster-response image and routed through the same observability loop.",
    riskScore: 76,
    recommendation: "Send to human review queue and compare against the nearest Arize embedding cluster.",
    evidence: ["Upload received", "Image embedding would be logged", "Phoenix trace would connect prompt, vision output, and review action"],
    detections: [
      { label: "unknown obstruction", confidence: 0.69, box: [28, 42, 34, 18], tone: "caution" },
      { label: "route uncertainty", confidence: 0.73, box: [12, 62, 66, 13], tone: "danger" }
    ],
    traceSpans: [
      { name: "upload.normalize_image", latencyMs: 116, status: "ok", output: "frame accepted" },
      { name: "gemini.vision.analyze_upload", latencyMs: 0, status: "mock", output: "configure GEMINI_API_KEY for live vision" },
      { name: "arize.log_embedding", latencyMs: 0, status: "mock", output: "configure Phoenix endpoint for live tracing" }
    ]
  };
}
