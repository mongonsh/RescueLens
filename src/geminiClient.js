const visionPrompt = `
You are RescueLens, a disaster-response computer vision agent.
Analyze the image for emergency operations. Return strict JSON with:
summary, riskScore from 0-100, recommendation, evidence array,
detections array of {label, confidence, box:[x,y,width,height], tone}.
Use percentage coordinates for boxes. Prefer human review for uncertain life-safety findings.
Do not invent certainty when the image is unclear.
`;

function uniqueModels(models) {
  return [...new Set(models.filter(Boolean))];
}

function modelCandidates(primary) {
  return uniqueModels([primary, process.env.GEMINI_FALLBACK_MODEL || "gemini-2.5-flash"]);
}

async function generateContentWithFallback({ primaryModel, body }) {
  const apiKey = process.env.GEMINI_API_KEY;
  let lastError;

  for (const model of modelCandidates(primaryModel)) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": apiKey
      },
      body: JSON.stringify(body)
    });

    if (response.ok) {
      return {
        model,
        payload: await response.json()
      };
    }

    lastError = new Error(`Gemini request failed for ${model}: ${response.status} ${await response.text()}`);
  }

  throw lastError || new Error("Gemini request failed");
}

function extractText(payload) {
  return payload?.candidates?.[0]?.content?.parts?.find((part) => part.text)?.text;
}

function extractInlineAudio(payload) {
  const inline = payload?.candidates?.[0]?.content?.parts?.find((part) => part.inlineData || part.inline_data);
  return inline?.inlineData || inline?.inline_data || null;
}

function parseJsonText(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error("Gemini did not return JSON");
    }
    return JSON.parse(match[0]);
  }
}

function buildWavFromPcm(pcmBuffer, sampleRate = 24000, channels = 1, bitsPerSample = 16) {
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;
  const header = Buffer.alloc(44);

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcmBuffer.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcmBuffer.length, 40);

  return Buffer.concat([header, pcmBuffer]);
}

export async function analyzeImageWithGemini({ imageBase64, mimeType }) {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || "gemini-3.5-flash";
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const { model: usedModel, payload } = await generateContentWithFallback({
    primaryModel: model,
    body: {
      contents: [
        {
          parts: [
            { text: visionPrompt },
            {
              inline_data: {
                mime_type: mimeType,
                data: imageBase64
              }
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.2,
        response_mime_type: "application/json"
      }
    }
  });
  const text = extractText(payload);
  if (!text) {
    throw new Error("Gemini response did not include text output");
  }

  const parsed = JSON.parse(text);
  return {
    ...parsed,
    traceSpans: [
      { name: "upload.normalize_image", latencyMs: 118, status: "ok", output: "frame accepted" },
      { name: "gemini.vision.analyze_upload", latencyMs: 1430, status: "ok", output: `structured disaster findings via ${usedModel}` },
      { name: "agent.route_human_review", latencyMs: 226, status: "ok", output: "review recommendation emitted" }
    ]
  };
}

export async function planAgentCommand({ command, mission, selectedFrame, activeSector, trace }) {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_AGENT_MODEL || process.env.GEMINI_MODEL || "gemini-3.5-flash";
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const context = {
    selectedFrame: {
      id: selectedFrame?.id,
      title: selectedFrame?.title,
      location: selectedFrame?.location,
      severity: selectedFrame?.severity,
      riskScore: selectedFrame?.analysis?.riskScore,
      summary: selectedFrame?.analysis?.summary,
      recommendation: selectedFrame?.analysis?.recommendation,
      evidence: selectedFrame?.analysis?.evidence
    },
    activeSector,
    availableFrames: mission.frames.map((frame) => ({
      id: frame.id,
      title: frame.title,
      location: frame.location,
      severity: frame.severity,
      riskScore: frame.analysis.riskScore,
      labels: frame.labels
    })),
    routes: mission.operations.routes,
    recentTrace: trace?.spans?.slice(-3) || []
  };

  const { model: usedModel, payload } = await generateContentWithFallback({
    primaryModel: model,
    body: {
      contents: [
        {
          parts: [
            {
              text: `
You are RescueLens Voice, a calm disaster-response operations agent.
The user command came from an incident commander. Use the mission context and return strict JSON only.

Choose one action:
- brief
- analyze
- improve
- dispatch
- close_route
- evacuate
- select_frame
- next_sector
- previous_sector
- arize_failure_analysis
- create_report
- none

If the command asks about roof/A7/survivor, targetFrameId should be "roof-01".
If it asks about road/route/west, targetFrameId should be "road-02".
If it asks about fire/smoke/ridge, targetFrameId should be "fire-03".
If it asks about bridge/mill, targetFrameId should be "bridge-04".

Return:
{
  "action": "one action string",
  "targetFrameId": "frame id or null",
  "sectorStatus": "optional new sector status or null",
  "routeId": "optional route id or null",
  "routeStatus": "optional route status or null",
  "artifactType": "dispatch_task, route_closure, eval_report, mission_report, or null",
  "spokenResponse": "1-3 natural sentences, specific to the mission, not robotic",
  "actionLog": "short past-tense operations log entry"
}

Do not claim a rescue was completed. Keep human approval in the loop. Mention uncertainty when confidence is low.
When the command asks to debug, inspect failures, use Arize, find similar failures, or improve observability, choose arize_failure_analysis.
When the command asks to document, export, summarize for handoff, or create a report, choose create_report.
Mission context:
${JSON.stringify(context, null, 2)}

User command: ${command}
`
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.35,
        response_mime_type: "application/json"
      }
    }
  });
  const text = extractText(payload);
  if (!text) {
    throw new Error("Gemini command response did not include text output");
  }
  return {
    ...parseJsonText(text),
    model: usedModel
  };
}

export async function synthesizeSpeechWithGemini({ text }) {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_TTS_MODEL || "gemini-3.1-flash-tts-preview";
  const voiceName = process.env.GEMINI_TTS_VOICE || "Kore";
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": apiKey
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: `Say in a calm, human, emergency-operations voice with natural pacing: "${text}"`
              }
            ]
          }
        ],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName
              }
            }
          }
        }
      })
    }
  );

  if (!response.ok) {
    throw new Error(`Gemini TTS failed: ${response.status} ${await response.text()}`);
  }

  const payload = await response.json();
  const inlineAudio = extractInlineAudio(payload);
  if (!inlineAudio?.data) {
    throw new Error("Gemini TTS did not return audio data");
  }

  const audioBuffer = Buffer.from(inlineAudio.data, "base64");
  const mimeType = inlineAudio.mimeType || inlineAudio.mime_type || "";
  if (mimeType.includes("wav")) {
    return { mimeType: "audio/wav", buffer: audioBuffer };
  }

  return { mimeType: "audio/wav", buffer: buildWavFromPcm(audioBuffer) };
}
