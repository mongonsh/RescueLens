import "./src/env.js";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { missionData, buildTraceForFrame, buildImprovementRun, buildUploadAnalysis } from "./src/missionData.js";
import { analyzeImageWithGemini, planAgentCommand, synthesizeSpeechWithGemini } from "./src/geminiClient.js";
import { recordTraceEvent } from "./src/arizePhoenix.js";
import { runArizeFailureWorkflow } from "./src/arizeMcpClient.js";
import { invokeAgentBuilderInteraction } from "./src/agentBuilderClient.js";
import { getIntegrationStatus } from "./src/integrationStatus.js";
import { buildArizeCvTelemetry } from "./src/arizeCv.js";
import { buildSubmissionReadiness } from "./src/submissionReadiness.js";
import {
  createDispatchTask,
  createEvalReport,
  createMissionReport,
  createRouteClosure,
  createSafetyPlan,
  listArtifacts
} from "./src/actionStore.js";
import { fetchLiveDisasterData, searchLiveEventsByLocation } from "./src/liveData.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(__dirname, "public");
const port = Number(process.env.PORT || 3000);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml; charset=utf-8"
};

function resolveFrame(body = {}, fallbackId = "roof-01") {
  const requestedId = body.frameId || body.selectedFrameId;
  const staticFrame = requestedId ? missionData.frames.find((frame) => frame.id === requestedId) : null;
  if (staticFrame) {
    return staticFrame;
  }

  if (body.frame?.id || body.selectedFrame?.id) {
    return body.frame || body.selectedFrame;
  }

  return missionData.frames.find((frame) => frame.id === fallbackId) || missionData.frames[0];
}

function buildTraceForAnyFrame(frame) {
  if (missionData.frames.some((item) => item.id === frame.id)) {
    return buildTraceForFrame(frame.id);
  }

  if (frame.id === "upload") {
    return {
      traceId: randomUUID(),
      frameId: frame.id,
      spans: [
        {
          name: "upload.normalize_drone_frame",
          latencyMs: 44,
          status: "ok",
          output: `${frame.title || "uploaded image"} normalized for field analysis`,
          arize: "metadata_trace"
        },
        {
          name: "gemini.vision.analyze_uploaded_frame",
          latencyMs: 620,
          status: "ok",
          output: frame.analysis?.summary || "Gemini vision analysis attached to uploaded frame",
          arize: "llm_span"
        },
        {
          name: "arize.cv.prepare_observability",
          latencyMs: 74,
          status: "ok",
          output: "object detection, classification, segmentation, embeddings, and drift checks prepared",
          arize: "cv_schema"
        },
        {
          name: "agent.route_human_review",
          latencyMs: 51,
          status: "warn",
          output: frame.analysis?.recommendation || "responder confirmation required before dispatch",
          arize: "human_review"
        }
      ],
      rootCause: "Uploaded drone frame requires Gemini visual reasoning plus Arize CV observability before operational action.",
      arizeSignals: ["uploaded image", "object detection", "classification", "segmentation", "embedding drift", "human review"]
    };
  }

  return {
    traceId: randomUUID(),
    frameId: frame.id,
    spans: [
      {
        name: "live_feed.normalize_event",
        latencyMs: 86,
        status: "ok",
        output: `${frame.liveEvent?.source || "public feed"} event normalized`,
        arize: "metadata_trace"
      },
      {
        name: "agent.set_live_incident_context",
        latencyMs: 142,
        status: "ok",
        output: frame.analysis?.summary || "live event selected",
        arize: "trace_eval"
      },
      {
        name: "agent.require_image_confirmation",
        latencyMs: 64,
        status: "warn",
        output: "field or drone image required before operational action",
        arize: "human_review"
      }
    ],
    rootCause: "Live public feed selected; Arize should evaluate downstream decisions after image confirmation.",
    arizeSignals: ["live metadata", "human review", "CV confirmation pending"]
  };
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function sendBinary(res, status, buffer, contentType) {
  res.writeHead(status, {
    "content-type": contentType,
    "cache-control": "no-store"
  });
  res.end(buffer);
}

async function parseJsonBody(req) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 12_000_000) {
      throw new Error("Request body too large");
    }
  }
  return body ? JSON.parse(body) : {};
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const rawPath = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const safePath = normalize(rawPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(publicDir, safePath);

  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const file = await readFile(filePath);
    res.writeHead(200, {
      "content-type": mimeTypes[extname(filePath)] || "application/octet-stream",
      "cache-control": "no-store"
    });
    res.end(file);
  } catch {
    const fallback = await readFile(join(publicDir, "index.html"));
    res.writeHead(200, {
      "content-type": mimeTypes[".html"],
      "cache-control": "no-store"
    });
    res.end(fallback);
  }
}

async function handleApi(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "GET" && url.pathname === "/api/mission") {
    sendJson(res, 200, missionData);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/integrations") {
    sendJson(res, 200, getIntegrationStatus());
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/submission-readiness") {
    let liveData = null;
    try {
      liveData = await fetchLiveDisasterData();
    } catch {
      liveData = null;
    }
    sendJson(res, 200, buildSubmissionReadiness({ liveData }));
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/submission-readiness/live-check") {
    const frame = missionData.frames[0];
    const trace = buildTraceForAnyFrame(frame);
    let liveData = null;
    try {
      liveData = await fetchLiveDisasterData();
    } catch {
      liveData = null;
    }
    const arizeWorkflow = await runArizeFailureWorkflow({ frame, trace });
    const agentBuilderRun = await invokeAgentBuilderInteraction({ frame, trace, mcpWorkflow: arizeWorkflow });
    sendJson(res, 200, {
      ...buildSubmissionReadiness({ liveData, agentBuilderRun, arizeWorkflow }),
      agentBuilderRun,
      arizeWorkflow
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/live-data") {
    sendJson(res, 200, await fetchLiveDisasterData());
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/location-search") {
    const query = url.searchParams.get("q") || "";
    sendJson(res, 200, await searchLiveEventsByLocation(query));
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/artifacts") {
    sendJson(res, 200, { artifacts: listArtifacts() });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/arize/cv-observability") {
    const body = await parseJsonBody(req);
    const frame = resolveFrame(body);
    const trace = body.trace || null;
    const telemetry = buildArizeCvTelemetry({ frame, trace });
    await recordTraceEvent({
      traceId: trace?.traceId || randomUUID(),
      frameId: frame.id,
      phase: "arize-cv-observability",
      spans: telemetry.traceSpans
    });
    sendJson(res, 200, telemetry);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/analyze") {
    const body = await parseJsonBody(req);
    const frame = resolveFrame(body);
    const trace = buildTraceForAnyFrame(frame);
    await recordTraceEvent({
      traceId: trace.traceId,
      frameId: frame.id,
      phase: "analysis",
      spans: trace.spans
    });
    sendJson(res, 200, {
      runId: randomUUID(),
      mode: "demo",
      frame,
      trace,
      analysis: frame.analysis,
      arizeCv: buildArizeCvTelemetry({ frame, trace })
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/analyze-upload") {
    const body = await parseJsonBody(req);
    const traceId = randomUUID();
    let analysis;
    let mode = "demo";

    if (body.imageBase64 && process.env.GEMINI_API_KEY) {
      analysis = await analyzeImageWithGemini({
        imageBase64: body.imageBase64,
        mimeType: body.mimeType || "image/jpeg"
      });
      mode = "gemini";
    } else {
      analysis = buildUploadAnalysis(body.fileName || "uploaded-frame.jpg");
    }

    await recordTraceEvent({
      traceId,
      frameId: "upload",
      phase: "upload-analysis",
      spans: analysis.traceSpans
    });

    sendJson(res, 200, {
      runId: randomUUID(),
      mode,
      traceId,
      analysis,
      arizeCv: buildArizeCvTelemetry({
        frame: {
          id: "upload",
          title: body.fileName || "uploaded-frame.jpg",
          location: "Uploaded frame",
          condition: mode === "gemini" ? "Live Gemini analysis" : "Demo analysis",
          severity: analysis.riskScore >= 85 ? "critical" : "high",
          confidence: 0.76,
          imageUrl: null,
          detections: analysis.detections || [],
          analysis
        },
        trace: { traceId }
      })
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/improve") {
    const body = await parseJsonBody(req);
    const frame = resolveFrame(body);
    const improvement = buildImprovementRun(frame.id);
    const artifact = createEvalReport({ frame, improvement });
    await recordTraceEvent({
      traceId: improvement.traceId,
      frameId: frame.id,
      phase: "self-improvement",
      spans: improvement.traceSpans
    });
    sendJson(res, 200, { ...improvement, artifact });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/arize/failure-analysis") {
    const body = await parseJsonBody(req);
    const frame = resolveFrame(body);
    const trace = body.trace || buildTraceForAnyFrame(frame);
    const workflow = await runArizeFailureWorkflow({ frame, trace });
    await recordTraceEvent({
      traceId: trace.traceId || randomUUID(),
      frameId: frame.id,
      phase: "arize-mcp-failure-analysis",
      spans: workflow.tools.map((tool) => ({
        name: tool.name,
        latencyMs: 0,
        status: tool.status,
        output: tool.output
      }))
    });
    sendJson(res, 200, workflow);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/agent-builder/invoke") {
    const body = await parseJsonBody(req);
    const frame = resolveFrame(body);
    const trace = body.trace || buildTraceForAnyFrame(frame);
    const agentBuilderRun = await invokeAgentBuilderInteraction({
      frame,
      trace,
      mcpWorkflow: body.mcpWorkflow || null
    });
    await recordTraceEvent({
      traceId: trace.traceId || randomUUID(),
      frameId: frame.id,
      phase: "google-agent-builder-interaction",
      spans: [
        {
          name: "google.agent_builder.interactions.create",
          latencyMs: 0,
          status: agentBuilderRun.called ? "ok" : agentBuilderRun.mode,
          output: agentBuilderRun.summary
        }
      ]
    });
    sendJson(res, 200, agentBuilderRun);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/artifacts") {
    const body = await parseJsonBody(req);
    const frame = resolveFrame(body);
    const sector = missionData.operations.sectors.find((item) => item.frameId === frame.id);
    const route = missionData.operations.routes.find((item) => item.id === body.routeId) || missionData.operations.routes[1];
    let artifact;

    if (body.type === "dispatch_task") {
      artifact = createDispatchTask({ frame, sector, recommendation: body.recommendation });
    } else if (body.type === "route_closure") {
      artifact = createRouteClosure({ frame, route });
    } else if (body.type === "safety_plan") {
      artifact = createSafetyPlan({
        mission: missionData,
        frame,
        trace: body.trace || null,
        actionLog: body.actionLog || [],
        cvTelemetry: body.cvTelemetry || null
      });
    } else {
      artifact = createMissionReport({
        mission: missionData,
        frame,
        trace: body.trace || null,
        actionLog: body.actionLog || []
      });
    }

    await recordTraceEvent({
      traceId: body.trace?.traceId || randomUUID(),
      frameId: frame.id,
      phase: "action-artifact-created",
      spans: [
        {
          name: `agent.action.${artifact.type}`,
          latencyMs: 0,
          status: "ok",
          output: artifact.title
        }
      ]
    });
    sendJson(res, 200, { artifact, artifacts: listArtifacts() });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/agent-command") {
    const body = await parseJsonBody(req);
    const selectedFrame = resolveFrame(body);
    const activeSector = missionData.operations.sectors.find((sector) => sector.frameId === selectedFrame.id);
    const plan = await planAgentCommand({
      command: body.command || "",
      mission: missionData,
      selectedFrame,
      activeSector,
      trace: body.trace || null
    });
    await recordTraceEvent({
      traceId: body.trace?.traceId || randomUUID(),
      frameId: selectedFrame.id,
      phase: "voice-agent-command",
      spans: [
        {
          name: "gemini.voice_agent.plan_command",
          latencyMs: 0,
          status: "ok",
          output: `${plan.action}: ${plan.spokenResponse}`
        }
      ]
    });
    sendJson(res, 200, { mode: "gemini", plan });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/tts") {
    const body = await parseJsonBody(req);
    const text = String(body.text || "").slice(0, 1600);
    if (!text) {
      sendJson(res, 400, { error: "Missing text" });
      return;
    }
    try {
      const audio = await synthesizeSpeechWithGemini({ text });
      sendBinary(res, 200, audio.buffer, audio.mimeType);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Gemini TTS failed";
      const isQuotaError = /429|quota|RESOURCE_EXHAUSTED/i.test(message);
      sendJson(res, isQuotaError ? 429 : 503, {
        error: isQuotaError
          ? "Gemini TTS quota is unavailable; use browser speech fallback."
          : "Gemini TTS is unavailable; use browser speech fallback.",
        fallback: "browser_speech"
      });
    }
    return;
  }

  sendJson(res, 404, { error: "Unknown API route" });
}

const server = createServer(async (req, res) => {
  try {
    if (req.url?.startsWith("/api/")) {
      await handleApi(req, res);
      return;
    }
    await serveStatic(req, res);
  } catch (error) {
    sendJson(res, 500, {
      error: error instanceof Error ? error.message : "Unexpected server error"
    });
  }
});

server.listen(port, () => {
  console.log(`RescueLens running at http://localhost:${port}`);
});
