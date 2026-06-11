import { getAgentBuilderRuntimeStatus } from "./agentBuilderClient.js";
import { getIntegrationStatus } from "./integrationStatus.js";

export function buildRuntimeVerification({ liveData = null, agentBuilderRun = null, arizeWorkflow = null } = {}) {
  const integrations = getIntegrationStatus();
  const agentBuilder = getAgentBuilderRuntimeStatus();
  const liveFeeds = liveData?.feeds || [];
  const feedLiveCount = liveFeeds.filter((feed) => feed.status === "live").length;

  const checks = [
    {
      id: "gemini",
      label: "Gemini runtime",
      status: integrations.gemini.configured ? "pass" : "fail",
      detail: integrations.gemini.configured
        ? `Gemini configured with ${integrations.gemini.agentModel}`
        : "Set GEMINI_API_KEY before hosting"
    },
    {
      id: "agent_builder_config",
      label: "Agent Builder config",
      status: agentBuilder.configured ? "pass" : "fail",
      detail: agentBuilder.configured
        ? `Endpoint ${agentBuilder.endpoint}; agent ${agentBuilder.agent}; auth ${agentBuilder.auth}`
        : "Set AGENT_BUILDER_ENDPOINT or GOOGLE_CLOUD_PROJECT plus Agent Builder auth"
    },
    {
      id: "agent_builder_live",
      label: "Agent Builder live call",
      status: agentBuilderRun?.called ? "pass" : "warn",
      detail: agentBuilderRun?.called
        ? `Live call completed through ${agentBuilderRun.mode}`
        : "Run the guided workflow after deploy; the Agent Builder row must show interaction called"
    },
    {
      id: "arize_mcp_config",
      label: "Arize Phoenix MCP config",
      status: integrations.arize.mcpMode === "demo" ? "fail" : "pass",
      detail:
        integrations.arize.mcpMode === "demo"
          ? "Set ARIZE_MCP_HTTP_URL or PHOENIX_BASE_URL/PHOENIX_API_KEY"
          : `MCP mode ${integrations.arize.mcpMode}`
    },
    {
      id: "arize_mcp_live",
      label: "Arize Phoenix MCP live call",
      status: arizeWorkflow?.connected ? "pass" : "warn",
      detail: arizeWorkflow?.connected
        ? `Connected through ${arizeWorkflow.mode}`
        : "Run the guided workflow after deploy; the Arize row must be http or stdio, not demo"
    },
    {
      id: "arize_cv",
      label: "Arize CV telemetry",
      status: integrations.arize.phoenixApiKey === "configured" || process.env.ARIZE_API_KEY ? "pass" : "warn",
      detail: process.env.ARIZE_API_KEY && process.env.ARIZE_SPACE_ID
        ? "Arize AX credentials configured"
        : "Local Arize-shaped CV telemetry works; set ARIZE_API_KEY and ARIZE_SPACE_ID for live Arize AX"
    },
    {
      id: "live_feeds",
      label: "Live public feeds",
      status: liveData ? (feedLiveCount > 0 ? "pass" : "warn") : "warn",
      detail: liveData
        ? `${feedLiveCount}/${liveFeeds.length} public feeds live; ${liveData.events?.length || 0} events loaded`
        : "Open hosted app or call /api/live-data to verify public feeds"
    }
  ];

  return {
    systemReady: checks.every((check) => check.status === "pass"),
    runtimeReady: checks
      .filter((check) => ["gemini", "agent_builder_config", "agent_builder_live", "arize_mcp_config", "arize_mcp_live"].includes(check.id))
      .every((check) => check.status === "pass"),
    checks
  };
}
