import { randomUUID } from "node:crypto";

const artifacts = [];

function now() {
  return new Date().toISOString();
}

export function createArtifact(type, title, body, metadata = {}) {
  const artifact = {
    id: randomUUID(),
    type,
    title,
    body,
    metadata,
    createdAt: now()
  };
  artifacts.unshift(artifact);
  return artifact;
}

export function createDispatchTask({ frame, sector, recommendation }) {
  return createArtifact(
    "dispatch_task",
    `Dispatch task: ${sector?.name || frame.location}`,
    {
      priority: frame.severity === "critical" ? "P1" : "P2",
      unit: sector?.unit || "Human review team",
      eta: sector?.eta || "pending",
      location: frame.location,
      instruction: recommendation || frame.analysis.recommendation,
      humanApprovalRequired: true
    },
    { frameId: frame.id, sectorId: sector?.id || null }
  );
}

export function createRouteClosure({ frame, route }) {
  return createArtifact(
    "route_closure",
    `Route closure: ${route?.label || frame.location}`,
    {
      status: route?.status || "Closed",
      route: route?.label || "Incident route",
      reason: frame.analysis.summary,
      alternateRoute: "County Line Road",
      humanApprovalRequired: true
    },
    { frameId: frame.id, routeId: route?.id || null }
  );
}

export function createEvalReport({ frame, improvement }) {
  return createArtifact(
    "eval_report",
    `Eval report: ${frame.location}`,
    {
      slice: "low_light_water_glare",
      summary: improvement.summary,
      patch: improvement.patch,
      metrics: improvement.metrics
    },
    { frameId: frame.id, traceId: improvement.traceId }
  );
}

export function createMissionReport({ mission, frame, trace, actionLog }) {
  return createArtifact(
    "mission_report",
    `Mission report: ${frame.location}`,
    {
      incident: mission.mission.incident,
      selectedFrame: frame.title,
      riskScore: frame.analysis.riskScore,
      severity: frame.severity,
      findings: frame.analysis.evidence,
      recommendation: frame.analysis.recommendation,
      latestTraceId: trace?.traceId || null,
      recentActions: actionLog || [],
      humanApprovalRequired: true
    },
    { frameId: frame.id, traceId: trace?.traceId || null }
  );
}

export function createSafetyPlan({ mission, frame, trace, actionLog, cvTelemetry }) {
  const intelligence = cvTelemetry?.fieldIntelligence || {};
  return createArtifact(
    "safety_plan",
    `Safety plan: ${frame.location}`,
    {
      incident: mission.mission.incident,
      selectedFrame: frame.title,
      riskScore: frame.analysis.riskScore,
      severity: frame.severity,
      recommendation: frame.analysis.recommendation,
      detections: intelligence.detectionGroups || [],
      safetyRoads: intelligence.safetyRoads || [],
      rehabilitationPlan: intelligence.rehabilitationPlan || null,
      heatmapPoints: intelligence.heatmap || [],
      recentActions: actionLog || [],
      humanApprovalRequired: true
    },
    { frameId: frame.id, traceId: trace?.traceId || null, source: "arize_cv_gemini_plan" }
  );
}

export function listArtifacts() {
  return artifacts.slice(0, 12);
}
