# Hosted Live Setup

Use this to make the hosted RescueLens URL show **live Agent Builder** and **live Arize MCP** in the public product demo.

## 1. Required live values

You need these values from your accounts:

```bash
PROJECT_ID="questclass-ee084"
REGION="us-central1"
SERVICE="rescuelens"

GEMINI_API_KEY="..."

AGENT_BUILDER_ENDPOINT="https://your-agent-builder-or-agent-runtime-endpoint"
AGENT_BUILDER_AGENT_ID="your-agent-id"

PHOENIX_BASE_URL="https://your-phoenix-endpoint"
PHOENIX_API_KEY="..."
ARIZE_MCP_HTTP_URL="https://your-phoenix-mcp-json-rpc-bridge"
ARIZE_API_KEY="..."
ARIZE_SPACE_ID="..."
```

If you do not have an MCP HTTP bridge, omit `ARIZE_MCP_HTTP_URL` and RescueLens will attempt stdio mode with `npx -y @arizeai/phoenix-mcp@latest` when `PHOENIX_BASE_URL` and `PHOENIX_API_KEY` are set.

## 2. Deploy or update Cloud Run

```bash
gcloud run deploy rescuelens \
  --source . \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --allow-unauthenticated \
  --set-env-vars "NODE_ENV=production,GOOGLE_CLOUD_PROJECT=$PROJECT_ID,GOOGLE_CLOUD_REGION=$REGION,AGENT_BUILDER_LOCATION=global,AGENT_BUILDER_ENDPOINT=$AGENT_BUILDER_ENDPOINT,AGENT_BUILDER_AGENT_ID=$AGENT_BUILDER_AGENT_ID,AGENT_BUILDER_ENDPOINT_AUTH=bearer,AGENT_BUILDER_ENDPOINT_TOKEN_TYPE=id_token,AGENT_BUILDER_USE_METADATA_TOKEN=true,PHOENIX_BASE_URL=$PHOENIX_BASE_URL,PHOENIX_API_KEY=$PHOENIX_API_KEY,ARIZE_MCP_HTTP_URL=$ARIZE_MCP_HTTP_URL,ARIZE_API_KEY=$ARIZE_API_KEY,ARIZE_SPACE_ID=$ARIZE_SPACE_ID,LIVE_DATA_LIMIT=24"
```

Set `GEMINI_API_KEY` as a secret if possible:

```bash
gcloud secrets create rescuelens-gemini-api-key --data-file=-
gcloud run services update rescuelens \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --update-secrets GEMINI_API_KEY=rescuelens-gemini-api-key:latest
```

Do the same for `PHOENIX_API_KEY`, `ARIZE_API_KEY`, and any endpoint token you cannot obtain through metadata identity.

## 3. Grant Cloud Run permission to call the agent endpoint

If `AGENT_BUILDER_ENDPOINT` is private Cloud Run or a Google-managed endpoint, grant the RescueLens runtime service account permission to invoke it. For Cloud Run-to-Cloud Run:

```bash
SERVICE_ACCOUNT="$(gcloud run services describe rescuelens --project "$PROJECT_ID" --region "$REGION" --format='value(spec.template.spec.serviceAccountName)')"

gcloud run services add-iam-policy-binding YOUR_AGENT_SERVICE \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --member "serviceAccount:$SERVICE_ACCOUNT" \
  --role "roles/run.invoker"
```

## 4. Hosted verification

Open the hosted URL in an incognito browser and click **Run agent workflow**.

The Runtime integrations panel must show:

- Gemini 3 reasoning: `called: ...`
- Google Cloud Agent Builder: `interaction called`
- Arize Phoenix MCP: `http` or `stdio`
- Runtime verification: `workflow verified`

Also check:

```bash
curl -X POST "$HOSTED_URL/api/runtime-verification/live-check"
```

`runtimeReady` should be `true`. If it is false, read the failing check details before recording a product walkthrough.
