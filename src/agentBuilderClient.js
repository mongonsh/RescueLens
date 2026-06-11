import { randomUUID } from "node:crypto";

const DEFAULT_AGENT = "antigravity-preview-05-2026";
const DEFAULT_API_REVISION = "2026-05-20";

function timeoutSignal(ms) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timeout)
  };
}

async function fetchMetadataAccessToken() {
  const { signal, clear } = timeoutSignal(Number(process.env.AGENT_BUILDER_AUTH_TIMEOUT_MS || 1800));
  try {
    const response = await fetch(
      "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",
      {
        headers: { "Metadata-Flavor": "Google" },
        signal
      }
    );
    if (!response.ok) {
      throw new Error(`metadata token failed: ${response.status}`);
    }
    const payload = await response.json();
    return payload.access_token || "";
  } finally {
    clear();
  }
}

async function fetchMetadataIdentityToken(audience) {
  const { signal, clear } = timeoutSignal(Number(process.env.AGENT_BUILDER_AUTH_TIMEOUT_MS || 1800));
  try {
    const url = new URL("http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity");
    url.searchParams.set("audience", audience);
    url.searchParams.set("format", "full");
    const response = await fetch(url, {
      headers: { "Metadata-Flavor": "Google" },
      signal
    });
    if (!response.ok) {
      throw new Error(`metadata identity token failed: ${response.status}`);
    }
    return response.text();
  } finally {
    clear();
  }
}

async function getGoogleAccessToken() {
  if (process.env.GOOGLE_CLOUD_ACCESS_TOKEN) {
    return process.env.GOOGLE_CLOUD_ACCESS_TOKEN;
  }
  if (process.env.AGENT_BUILDER_USE_METADATA_TOKEN === "true") {
    return fetchMetadataAccessToken();
  }
  return "";
}

async function getEndpointBearerToken(endpoint) {
  if (process.env.AGENT_BUILDER_ENDPOINT_TOKEN) {
    return process.env.AGENT_BUILDER_ENDPOINT_TOKEN;
  }
  if (process.env.GOOGLE_CLOUD_ACCESS_TOKEN) {
    return process.env.GOOGLE_CLOUD_ACCESS_TOKEN;
  }
  if (process.env.AGENT_BUILDER_USE_METADATA_TOKEN === "true") {
    const tokenType = process.env.AGENT_BUILDER_ENDPOINT_TOKEN_TYPE || "id_token";
    if (tokenType === "access_token") {
      return fetchMetadataAccessToken();
    }
    return fetchMetadataIdentityToken(process.env.AGENT_BUILDER_ENDPOINT_AUDIENCE || endpoint);
  }
  return "";
}

function buildInteractionInput({ frame, trace, mcpWorkflow }) {
  return [
    "You are RescueLens running in Gemini Enterprise Agent Platform.",
    "Create a supervised disaster-response handoff. Keep humans in control.",
    `Incident: ${frame.title || frame.location}`,
    `Location: ${frame.location}`,
    `Risk score: ${frame.analysis?.riskScore ?? "unknown"}`,
    `Gemini recommendation: ${frame.analysis?.recommendation || "pending"}`,
    `Trace: ${trace?.traceId || "pending"}`,
    `Arize MCP: ${mcpWorkflow?.mode || "pending"} ${mcpWorkflow?.failureSlice?.name || ""}`,
    "Return three concise bullets: situation, model-risk check, human-approved next action."
  ].join("\n");
}

function parseSse(text) {
  const events = [];
  let eventName = "";
  let data = "";

  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith("event:")) {
      eventName = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      data += line.slice(5).trim();
    } else if (!line.trim() && data) {
      try {
        events.push({ eventName, payload: JSON.parse(data) });
      } catch {
        events.push({ eventName, payload: { raw: data } });
      }
      eventName = "";
      data = "";
    }
  }

  if (data) {
    try {
      events.push({ eventName, payload: JSON.parse(data) });
    } catch {
      events.push({ eventName, payload: { raw: data } });
    }
  }

  return events;
}

function fallbackInteraction({ reason, error, frame }) {
  return {
    mode: reason,
    called: false,
    agent: process.env.AGENT_BUILDER_AGENT_ID || process.env.AGENT_BUILDER_BASE_AGENT || DEFAULT_AGENT,
    endpoint: process.env.AGENT_BUILDER_ENDPOINT || "",
    platform: "Gemini Enterprise Agent Platform / Agent Builder",
    projectId: process.env.GOOGLE_CLOUD_PROJECT || "",
    location: process.env.AGENT_BUILDER_LOCATION || "global",
    summary:
      "Agent Builder runtime call is configured in code but did not reach the managed Interactions API in this environment.",
    handoff: [
      `Situation: ${frame.title || frame.location}`,
      "Model-risk check: Gemini plan and Arize MCP failure loop stay visible before action.",
      "Human-approved next action: create report or dispatch task only after responder approval."
    ],
    error
  };
}

export function getAgentBuilderRuntimeStatus() {
  const endpoint = process.env.AGENT_BUILDER_ENDPOINT || "";
  return {
    configured: Boolean(endpoint || process.env.GOOGLE_CLOUD_PROJECT),
    endpoint: endpoint ? "configured" : "not configured",
    projectId: process.env.GOOGLE_CLOUD_PROJECT || "not configured",
    location: process.env.AGENT_BUILDER_LOCATION || "global",
    agent: process.env.AGENT_BUILDER_AGENT_ID || process.env.AGENT_BUILDER_BASE_AGENT || DEFAULT_AGENT,
    apiRevision: process.env.AGENT_BUILDER_API_REVISION || DEFAULT_API_REVISION,
    auth:
      process.env.GOOGLE_CLOUD_ACCESS_TOKEN || process.env.AGENT_BUILDER_USE_METADATA_TOKEN === "true"
        ? "token-ready"
        : "token-needed"
  };
}

async function invokeHostedAgentBuilderEndpoint({ frame, trace, mcpWorkflow }) {
  const endpoint = process.env.AGENT_BUILDER_ENDPOINT;
  const authMode = process.env.AGENT_BUILDER_ENDPOINT_AUTH || "bearer";
  const headers = { "content-type": "application/json" };
  if (authMode === "bearer") {
    const token = await getEndpointBearerToken(endpoint);
    if (!token) {
      return fallbackInteraction({ reason: "endpoint-token-needed", frame });
    }
    headers.authorization = `Bearer ${token}`;
  } else if (authMode === "api-key" && process.env.AGENT_BUILDER_ENDPOINT_API_KEY) {
    headers["x-api-key"] = process.env.AGENT_BUILDER_ENDPOINT_API_KEY;
  }

  const body = {
    source: "rescuelens",
    input: buildInteractionInput({ frame, trace, mcpWorkflow }),
    frame: {
      id: frame.id,
      title: frame.title,
      location: frame.location,
      severity: frame.severity,
      riskScore: frame.analysis?.riskScore,
      recommendation: frame.analysis?.recommendation
    },
    trace: {
      traceId: trace?.traceId,
      spanCount: trace?.spans?.length || 0
    },
    arizeMcp: {
      mode: mcpWorkflow?.mode,
      connected: Boolean(mcpWorkflow?.connected),
      failureSlice: mcpWorkflow?.failureSlice?.name
    }
  };

  const { signal, clear } = timeoutSignal(Number(process.env.AGENT_BUILDER_TIMEOUT_MS || 15000));
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`Agent Builder endpoint failed: ${response.status} ${text}`);
    }
    let payload = {};
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      payload = { text };
    }
    return {
      mode: "live-endpoint",
      called: true,
      requestId: randomUUID(),
      agent: process.env.AGENT_BUILDER_AGENT_ID || process.env.AGENT_BUILDER_BASE_AGENT || "hosted-agent",
      endpoint: new URL(endpoint).origin,
      platform: "Google Cloud Agent Builder hosted endpoint",
      projectId: process.env.GOOGLE_CLOUD_PROJECT || "",
      location: process.env.AGENT_BUILDER_LOCATION || "global",
      status: payload.status || "ok",
      eventCount: Array.isArray(payload.events) ? payload.events.length : 1,
      summary: "Live Agent Builder hosted endpoint call completed for the RescueLens mission handoff.",
      handoff: payload.handoff || [
        "Situation: live incident context passed to hosted Agent Builder endpoint.",
        "Model-risk check: Gemini trace and Arize MCP failure slice included in the request.",
        "Human-approved next action: managed agent handoff completed before report creation."
      ],
      response: payload
    };
  } catch (error) {
    return fallbackInteraction({
      reason: "endpoint-fallback",
      frame,
      error: error instanceof Error ? error.message : "Agent Builder endpoint call failed"
    });
  } finally {
    clear();
  }
}

export async function invokeAgentBuilderInteraction({ frame, trace, mcpWorkflow }) {
  if (process.env.AGENT_BUILDER_ENDPOINT) {
    return invokeHostedAgentBuilderEndpoint({ frame, trace, mcpWorkflow });
  }

  const projectId = process.env.GOOGLE_CLOUD_PROJECT;
  const location = process.env.AGENT_BUILDER_LOCATION || "global";
  const agent = process.env.AGENT_BUILDER_AGENT_ID || process.env.AGENT_BUILDER_BASE_AGENT || DEFAULT_AGENT;
  const apiRevision = process.env.AGENT_BUILDER_API_REVISION || DEFAULT_API_REVISION;

  if (!projectId) {
    return fallbackInteraction({ reason: "project-missing", frame });
  }

  let accessToken = "";
  try {
    accessToken = await getGoogleAccessToken();
  } catch (error) {
    return fallbackInteraction({
      reason: "auth-token-error",
      frame,
      error: error instanceof Error ? error.message : "Could not obtain Google Cloud access token"
    });
  }

  if (!accessToken) {
    return fallbackInteraction({ reason: "auth-token-needed", frame });
  }

  const endpoint = `https://aiplatform.googleapis.com/v1beta1/projects/${encodeURIComponent(projectId)}/locations/${encodeURIComponent(location)}/interactions`;
  const body = {
    stream: true,
    background: true,
    store: true,
    agent,
    environment: { type: "remote" },
    input: [
      {
        type: "user_input",
        content: [
          {
            type: "text",
            text: buildInteractionInput({ frame, trace, mcpWorkflow })
          }
        ]
      }
    ]
  };

  const { signal, clear } = timeoutSignal(Number(process.env.AGENT_BUILDER_TIMEOUT_MS || 15000));
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${accessToken}`,
        "Api-Revision": apiRevision
      },
      body: JSON.stringify(body),
      signal
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`Agent Builder interaction failed: ${response.status} ${text}`);
    }
    const events = parseSse(text);
    const complete = events.find((event) => event.payload?.event_type === "interaction.complete")?.payload;
    return {
      mode: "live",
      called: true,
      requestId: randomUUID(),
      agent,
      platform: "Gemini Enterprise Agent Platform / Agent Builder",
      projectId,
      location,
      apiRevision,
      interactionId: complete?.interaction?.id || null,
      environmentId: complete?.interaction?.environment_id || null,
      status: complete?.interaction?.status || "submitted",
      eventCount: events.length,
      summary: "Live Agent Builder Interactions API call completed for the RescueLens mission handoff.",
      handoff: [
        "Situation: live incident context passed to managed agent runtime.",
        "Model-risk check: Gemini trace and Arize MCP failure slice included in the prompt.",
        "Human-approved next action: managed agent returns handoff guidance before report creation."
      ]
    };
  } catch (error) {
    return fallbackInteraction({
      reason: "fallback",
      frame,
      error: error instanceof Error ? error.message : "Agent Builder interaction failed"
    });
  } finally {
    clear();
  }
}
