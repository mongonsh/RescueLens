export async function recordTraceEvent(event) {
  const endpoint = process.env.PHOENIX_COLLECTOR_ENDPOINT;
  if (!endpoint) {
    return { mode: "demo", recorded: false };
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(process.env.PHOENIX_API_KEY ? { authorization: `Bearer ${process.env.PHOENIX_API_KEY}` } : {})
      },
      body: JSON.stringify({
        service: "rescuelens",
        event
      })
    });

    return {
      mode: "phoenix",
      recorded: response.ok,
      status: response.status
    };
  } catch (error) {
    return {
      mode: "phoenix",
      recorded: false,
      error: error instanceof Error ? error.message : "Phoenix trace export failed"
    };
  }
}
