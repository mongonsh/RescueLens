import { getAgentBuilderRuntimeStatus } from "./agentBuilderClient.js";

export function getIntegrationStatus() {
  const geminiModel = process.env.GEMINI_MODEL || "gemini-3.5-flash";
  const agentModel = process.env.GEMINI_AGENT_MODEL || geminiModel;
  const ttsModel = process.env.GEMINI_TTS_MODEL || "gemini-3.1-flash-tts-preview";
  const phoenixBaseUrl = process.env.PHOENIX_BASE_URL || "";
  const phoenixCollector = process.env.PHOENIX_COLLECTOR_ENDPOINT || "";
  const arizeMcpUrl = process.env.ARIZE_MCP_HTTP_URL || "";
  const arizeMcpCommand = process.env.ARIZE_MCP_COMMAND || "";
  const agentBuilder = getAgentBuilderRuntimeStatus();

  return {
    gemini: {
      configured: Boolean(process.env.GEMINI_API_KEY),
      model: geminiModel,
      agentModel,
      ttsModel,
      fallbackModel: process.env.GEMINI_FALLBACK_MODEL || "gemini-2.5-flash"
    },
    googleCloud: {
      agentPlatform: "Gemini Enterprise Agent Platform / Agent Builder",
      deployment: "Cloud Run",
      projectId: process.env.GOOGLE_CLOUD_PROJECT || "not configured",
      region: process.env.GOOGLE_CLOUD_LOCATION || process.env.GOOGLE_CLOUD_REGION || "us-central1",
      agentBuilder
    },
    arize: {
      track: "Arize",
      phoenixBaseUrl: phoenixBaseUrl ? new URL(phoenixBaseUrl).origin : "not configured",
      phoenixCollector: phoenixCollector ? "configured" : "demo trace exporter",
      phoenixApiKey: process.env.PHOENIX_API_KEY ? "configured" : "not configured",
      mcpMode: arizeMcpUrl ? "http" : arizeMcpCommand || phoenixBaseUrl ? "stdio" : "demo",
      mcpServer: "@arizeai/phoenix-mcp"
    }
  };
}
