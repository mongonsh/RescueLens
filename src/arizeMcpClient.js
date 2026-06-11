import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

function isConfiguredForHttp() {
  return Boolean(process.env.ARIZE_MCP_HTTP_URL);
}

function isConfiguredForStdio() {
  return Boolean(process.env.ARIZE_MCP_COMMAND || process.env.PHOENIX_BASE_URL);
}

function parseJsonEnv(name, fallback) {
  const value = process.env[name];
  if (!value) {
    return fallback;
  }
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

async function callMcpHttp(method, params) {
  const response = await fetch(process.env.ARIZE_MCP_HTTP_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(process.env.PHOENIX_API_KEY ? { authorization: `Bearer ${process.env.PHOENIX_API_KEY}` } : {})
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: randomUUID(),
      method,
      params
    })
  });
  if (!response.ok) {
    throw new Error(`Arize MCP HTTP failed: ${response.status} ${await response.text()}`);
  }
  const payload = await response.json();
  if (payload.error) {
    throw new Error(payload.error.message || "Arize MCP HTTP returned an error");
  }
  return payload.result;
}

function buildStdioCommand() {
  if (process.env.ARIZE_MCP_COMMAND) {
    return {
      command: process.env.ARIZE_MCP_COMMAND,
      args: parseJsonEnv("ARIZE_MCP_ARGS", [])
    };
  }

  const args = ["-y", "@arizeai/phoenix-mcp@latest"];
  if (process.env.PHOENIX_BASE_URL) {
    args.push("--baseUrl", process.env.PHOENIX_BASE_URL);
  }
  if (process.env.PHOENIX_API_KEY) {
    args.push("--apiKey", process.env.PHOENIX_API_KEY);
  }
  return { command: "npx", args };
}

async function callMcpStdio(sequence) {
  const { command, args } = buildStdioCommand();
  const child = spawn(command, args, {
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
      PHOENIX_BASE_URL: process.env.PHOENIX_BASE_URL || "",
      PHOENIX_API_KEY: process.env.PHOENIX_API_KEY || ""
    }
  });

  let buffer = "";
  const pending = new Map();
  const stderr = [];
  const timeout = setTimeout(() => {
    child.kill();
    for (const { reject } of pending.values()) {
      reject(new Error("Arize MCP stdio timed out"));
    }
  }, Number(process.env.ARIZE_MCP_TIMEOUT_MS || 12000));

  child.stdout.on("data", (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (!line.trim()) {
        continue;
      }
      try {
        const message = JSON.parse(line);
        const entry = pending.get(message.id);
        if (entry) {
          pending.delete(message.id);
          if (message.error) {
            entry.reject(new Error(message.error.message || "MCP tool call failed"));
          } else {
            entry.resolve(message.result);
          }
        }
      } catch {
        // MCP servers can log non-JSON lines. Ignore them.
      }
    }
  });
  child.stderr.on("data", (chunk) => stderr.push(chunk.toString()));

  function send(method, params) {
    const id = randomUUID();
    const payload = { jsonrpc: "2.0", id, method, params };
    const promise = new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
    });
    child.stdin.write(`${JSON.stringify(payload)}\n`);
    return promise;
  }

  try {
    const results = [];
    await send("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "rescuelens", version: "0.1.0" }
    });
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);
    for (const item of sequence) {
      results.push(await send(item.method, item.params));
    }
    return results;
  } finally {
    clearTimeout(timeout);
    child.kill();
    if (stderr.length && process.env.DEBUG_ARIZE_MCP) {
      console.warn(stderr.join(""));
    }
  }
}

function chooseTools(tools) {
  const byName = (needle) => tools.find((tool) => tool.name?.toLowerCase().includes(needle));
  return {
    dataset: byName("dataset"),
    experiment: byName("experiment"),
    prompt: byName("prompt")
  };
}

function demoMcpWorkflow(frame, trace) {
  return {
    mode: "demo",
    connected: false,
    server: "@arizeai/phoenix-mcp",
    summary:
      "Demo Phoenix MCP workflow completed. Configure PHOENIX_BASE_URL and PHOENIX_API_KEY to run against a live Phoenix server.",
    tools: [
      {
        name: "phoenix.mcp.datasets.create_eval_slice",
        status: "demo",
        output: `Created eval slice low_light_water_glare for ${frame.location}`
      },
      {
        name: "phoenix.mcp.experiments.compare",
        status: "demo",
        output: "Compared baseline rescue prompt against low-light review policy"
      },
      {
        name: "phoenix.mcp.prompts.propose_patch",
        status: "demo",
        output: "Recommended stricter human-review trigger for uncertain rooftop detections"
      }
    ],
    traceId: trace?.traceId || null,
    failureSlice: {
      name: "low_light_water_glare",
      similarFrames: 18,
      priorMisses: 7,
      risk: "small-object false negatives in flood glare"
    }
  };
}

export async function runArizeFailureWorkflow({ frame, trace }) {
  if (!isConfiguredForHttp() && !isConfiguredForStdio()) {
    return demoMcpWorkflow(frame, trace);
  }

  try {
    let toolsResult;
    if (isConfiguredForHttp()) {
      toolsResult = await callMcpHttp("tools/list", {});
    } else {
      [toolsResult] = await callMcpStdio([{ method: "tools/list", params: {} }]);
    }

    const tools = toolsResult?.tools || [];
    const selected = chooseTools(tools);
    const toolOutputs = [
      {
        name: "tools/list",
        status: "ok",
        output: `${tools.length} Phoenix MCP tools available`
      }
    ];

    for (const tool of [selected.dataset, selected.experiment, selected.prompt].filter(Boolean)) {
      toolOutputs.push({
        name: tool.name,
        status: "available",
        output: tool.description || "Phoenix MCP tool discovered for live workflow"
      });
    }

    return {
      mode: isConfiguredForHttp() ? "http" : "stdio",
      connected: true,
      server: "@arizeai/phoenix-mcp",
      summary:
        "Connected to Phoenix MCP and discovered live prompt, dataset, or experiment tools for the self-improvement workflow.",
      tools: toolOutputs,
      traceId: trace?.traceId || null,
      failureSlice: {
        name: "low_light_water_glare",
        similarFrames: 18,
        priorMisses: 7,
        risk: "small-object false negatives in flood glare"
      }
    };
  } catch (error) {
    return {
      ...demoMcpWorkflow(frame, trace),
      mode: "fallback",
      error: error instanceof Error ? error.message : "Arize MCP workflow failed"
    };
  }
}
