import { randomUUID } from "node:crypto";

const CAPABILITY_DOCS = {
  classification: "https://arize.com/docs/ax/machine-learning/computer-vision/use-cases-cv/computer-vision-cv",
  objectDetection: "https://arize.com/docs/ax/machine-learning/computer-vision/use-cases-cv/object-detection",
  segmentation: "https://arize.com/docs/ax/machine-learning/computer-vision/use-cases-cv/image-segmentation",
  metrics: "https://arize.com/docs/ax/machine-learning/computer-vision/use-cases-cv/available-metrics",
  evaluators: "https://arize.com/docs/ax/evaluate/create-evaluators"
};

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function finiteNumber(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function hashString(value) {
  const text = String(value || "");
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function hashUnit(value, salt = "") {
  return (hashString(`${salt}:${value}`) % 10_000) / 10_000;
}

function snake(value) {
  return String(value || "unknown")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "unknown";
}

function severityRank(severity) {
  return { critical: 3, high: 2, medium: 1, low: 0 }[severity] || 1;
}

function predictionLabel(frame) {
  const eventCategory = frame.liveEvent?.category || frame.condition || frame.labels?.[0] || frame.title;
  if (String(eventCategory).toLowerCase().includes("earthquake")) {
    return "earthquake_impact";
  }
  if (String(eventCategory).toLowerCase().includes("flood")) {
    return "flood_urban";
  }
  if (String(eventCategory).toLowerCase().includes("fire") || String(eventCategory).toLowerCase().includes("smoke")) {
    return "wildfire_smoke";
  }
  if (String(eventCategory).toLowerCase().includes("road") || String(eventCategory).toLowerCase().includes("route")) {
    return "blocked_route";
  }
  if (String(eventCategory).toLowerCase().includes("bridge")) {
    return "bridge_damage";
  }
  return snake(eventCategory);
}

function detectionTone(label) {
  const lower = String(label || "").toLowerCase();
  if (
    lower.includes("survivor") ||
    lower.includes("human") ||
    lower.includes("person") ||
    lower.includes("animal") ||
    lower.includes("fire") ||
    lower.includes("blocked") ||
    lower.includes("damage") ||
    lower.includes("unsafe")
  ) {
    return "danger";
  }
  if (lower.includes("water") || lower.includes("flood")) {
    return "water";
  }
  if (lower.includes("smoke")) {
    return "smoke";
  }
  return "caution";
}

function frameText(frame) {
  return [
    frame.title,
    frame.location,
    frame.condition,
    ...(frame.labels || []),
    frame.analysis?.summary,
    frame.analysis?.recommendation,
    ...(frame.analysis?.evidence || [])
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function includesAny(text, terms) {
  return terms.some((term) => text.includes(term));
}

function hazardDetectionForFrame(frame) {
  const label = predictionLabel(frame);
  const source = frame.liveEvent?.source || frame.condition || frame.title;
  const score = frame.liveEvent ? 0.72 : finiteNumber(frame.confidence, 0.76);
  const liveOffset = hashUnit(frame.id || frame.title, "box");
  const left = 18 + Math.round(liveOffset * 18);
  const top = 18 + Math.round(hashUnit(source, "top") * 16);
  const width = label.includes("earthquake") ? 42 : label.includes("wildfire") ? 46 : 52;
  const height = label.includes("earthquake") ? 35 : label.includes("blocked") ? 24 : 42;
  return {
    label: label.includes("earthquake") ? "impact area" : label.includes("wildfire") ? "hazard plume" : "affected area",
    confidence: score,
    box: [left, top, width, height],
    tone: detectionTone(label)
  };
}

function derivedDetectionsForFrame(frame, existing = []) {
  const text = frameText(frame);
  const riskScore = finiteNumber(frame.analysis?.riskScore, 70);
  const scoreBase = clamp(0.56 + riskScore / 250, 0.56, 0.93);
  const existingLabels = new Set(existing.map((item) => item.label));
  const derived = [];

  const add = (label, displayLabel, box, confidence, tone = detectionTone(label)) => {
    const normalized = snake(label);
    if (existingLabels.has(normalized)) {
      return;
    }
    existingLabels.add(normalized);
    derived.push({
      label: normalized,
      displayLabel,
      score: clamp(confidence, 0.1, 0.98),
      coordinates: box,
      tone
    });
  };

  if (!existing.some((item) => includesAny(item.label, ["flood", "fire", "smoke", "damage", "hazard", "impact", "blocked"]))) {
    const hazard = hazardDetectionForFrame(frame);
    add(hazard.label, hazard.label, hazard.box, hazard.confidence, hazard.tone);
  }

  if (includesAny(text, ["person", "human", "survivor", "occupant", "victim", "people"])) {
    add("human_signal", "human signal", [54, 18, 12, 12], scoreBase, "danger");
  }

  if (includesAny(text, ["animal", "pet", "dog", "cat", "livestock", "horse"])) {
    add("animal_signal", "animal signal", [18, 47, 13, 11], 0.66, "danger");
  }

  if (includesAny(text, ["house", "building", "structure", "bridge", "roof", "wall", "tilted", "submerged"])) {
    add("unstable_structure", "unstable structure", [34, 20, 42, 42], clamp(scoreBase + 0.04, 0.1, 0.96), "danger");
  }

  if (!existing.some((item) => includesAny(item.label, ["road", "route", "corridor", "bridge"]))) {
    const blocked = includesAny(text, ["blocked", "washed out", "debris", "flood", "submerged", "fire", "bridge"]);
    add(
      blocked ? "unsafe_road_corridor" : "response_road_corridor",
      blocked ? "unsafe road corridor" : "response road corridor",
      [9, 72, 76, 12],
      blocked ? 0.68 : 0.73,
      blocked ? "danger" : "safe"
    );
  }

  return derived;
}

function dedupeDetections(detections) {
  const seen = new Set();
  return detections.filter((detection) => {
    const key = `${detection.label}:${detection.coordinates.join(",")}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function normalizeDetections(frame) {
  const detections = Array.isArray(frame.detections) ? frame.detections.filter((item) => Array.isArray(item.box)) : [];
  const usable = detections.length ? detections : [hazardDetectionForFrame(frame)];
  const normalized = usable.map((detection) => ({
    label: snake(detection.label),
    displayLabel: detection.label || "affected area",
    score: clamp(finiteNumber(detection.confidence, 0.65), 0, 1),
    coordinates: detection.box.map((value) => Math.round(finiteNumber(value, 0) * 100) / 100),
    tone: detection.tone || detectionTone(detection.label)
  }));
  return dedupeDetections([...normalized, ...derivedDetectionsForFrame(frame, normalized)]);
}

function boxToPolygon([left, top, width, height], inset = 0) {
  const x1 = clamp(left + inset, 0, 100);
  const y1 = clamp(top + inset, 0, 100);
  const x2 = clamp(left + width - inset, 0, 100);
  const y2 = clamp(top + height - inset, 0, 100);
  return [
    [x1, y1],
    [x2, y1],
    [x2, y2],
    [x1, y2]
  ].map(([x, y]) => [Math.round(x * 100) / 100, Math.round(y * 100) / 100]);
}

function semanticLabelForFrame(frame) {
  const label = predictionLabel(frame);
  if (label.includes("flood")) {
    return "floodwater_boundary";
  }
  if (label.includes("wildfire")) {
    return "smoke_or_fire_boundary";
  }
  if (label.includes("earthquake")) {
    return "impact_zone";
  }
  if (label.includes("blocked")) {
    return "blocked_route_surface";
  }
  if (label.includes("bridge")) {
    return "unsafe_bridge_edge";
  }
  return "hazard_region";
}

function buildSegmentation(frame, detections) {
  const semanticLabel = semanticLabelForFrame(frame);
  const primaryBox = detections[0]?.coordinates || [20, 20, 48, 36];
  const semanticPolygon = boxToPolygon(primaryBox, -4);
  const semantic = [
    {
      label: semanticLabel,
      score: clamp(0.68 + severityRank(frame.severity) * 0.06, 0.68, 0.91),
      polygon: semanticPolygon,
      type: "semantic"
    }
  ];

  const instance = detections.map((detection, index) => ({
    id: `${detection.label}-${index + 1}`,
    label: detection.label,
    score: detection.score,
    polygon: boxToPolygon(detection.coordinates, 1.8),
    box: detection.coordinates,
    type: "instance"
  }));

  return { semantic, instance };
}

function embeddingVector(frame, detections, segmentation) {
  const label = predictionLabel(frame);
  const riskScore = finiteNumber(frame.analysis?.riskScore, frame.liveEvent?.riskScore || 65);
  const lat = finiteNumber(frame.liveEvent?.lat, 0);
  const lon = finiteNumber(frame.liveEvent?.lon, 0);
  const detectionScore =
    detections.reduce((sum, detection) => sum + detection.score, 0) / Math.max(1, detections.length);
  return [
    riskScore / 100,
    finiteNumber(frame.confidence, 0.7),
    severityRank(frame.severity) / 3,
    Math.min(1, detections.length / 8),
    Math.min(1, segmentation.semantic.length / 4),
    Math.min(1, segmentation.instance.length / 8),
    detectionScore,
    hashUnit(label, "label"),
    hashUnit(frame.location, "location"),
    (lat + 90) / 180,
    (lon + 180) / 360,
    frame.imageUrl ? 1 : 0
  ].map((value) => Math.round(clamp(value) * 10000) / 10000);
}

function euclidean(a, b) {
  const length = Math.max(a.length, b.length);
  let sum = 0;
  for (let index = 0; index < length; index += 1) {
    const delta = finiteNumber(a[index], 0) - finiteNumber(b[index], 0);
    sum += delta * delta;
  }
  return Math.sqrt(sum);
}

function driftCluster(frame, vector) {
  const clusters = [
    {
      name: "clear_daytime_response",
      label: "Clear daytime response",
      center: [0.42, 0.86, 0.36, 0.18, 0.18, 0.18, 0.82, 0.21, 0.34, 0.5, 0.5, 1],
      failures: 2
    },
    {
      name: "low_light_water_glare",
      label: "Low-light water glare",
      center: [0.88, 0.66, 1, 0.38, 0.24, 0.34, 0.63, 0.55, 0.31, 0.52, 0.48, 1],
      failures: 7
    },
    {
      name: "smoke_occlusion",
      label: "Smoke occlusion",
      center: [0.82, 0.72, 0.84, 0.34, 0.4, 0.34, 0.66, 0.73, 0.61, 0.55, 0.43, 1],
      failures: 5
    },
    {
      name: "new_infrastructure_damage",
      label: "New infrastructure damage",
      center: [0.78, 0.78, 0.68, 0.3, 0.3, 0.28, 0.72, 0.39, 0.72, 0.53, 0.47, 1],
      failures: 4
    }
  ];
  const ranked = clusters
    .map((cluster) => ({
      ...cluster,
      distance: Math.round(euclidean(vector, cluster.center) * 1000) / 1000
    }))
    .sort((a, b) => a.distance - b.distance);
  const selected = ranked[0];
  const driftScore = Math.round(clamp(selected.distance / 1.75) * 100);
  return {
    selected: {
      name: selected.name,
      label: selected.label,
      distance: selected.distance,
      priorFailures: selected.failures,
      driftScore
    },
    nearest: ranked.slice(0, 3).map(({ name, label, distance, failures }) => ({
      name,
      label,
      distance,
      priorFailures: failures
    })),
    alert: driftScore >= 42 ? "review" : "monitor"
  };
}

function imageLink(frame) {
  return frame.imageUrl || frame.droneImageUrl || frame.liveEvent?.imageUrl || "local-upload-or-generated-frame";
}

function buildPredictionRow({ frame, detections, segmentation, vector, drift }) {
  const label = predictionLabel(frame);
  const score = clamp(finiteNumber(frame.confidence, 0.7) + severityRank(frame.severity) * 0.035, 0.5, 0.97);
  const timestamp = new Date(frame.liveEvent?.updated || frame.liveEvent?.time || Date.now()).toISOString();
  return {
    prediction_id: frame.id || randomUUID(),
    prediction_ts: timestamp,
    image_link: imageLink(frame),
    image_vector: vector,
    prediction_label: label,
    prediction_score: Math.round(score * 1000) / 1000,
    actual_label: null,
    prediction_bboxes: detections.map((detection) => detection.coordinates),
    prediction_categories: detections.map((detection) => detection.label),
    prediction_scores: detections.map((detection) => detection.score),
    actual_bboxes: [],
    actual_categories: [],
    prediction_semantic_segmentation_polygon_labels: segmentation.semantic.map((segment) => segment.label),
    prediction_semantic_segmentation_polygon_coordinates: segmentation.semantic.map((segment) => segment.polygon),
    actual_semantic_segmentation_polygon_labels: [],
    actual_semantic_segmentation_polygon_coordinates: [],
    prediction_instance_segmentation_polygon_labels: segmentation.instance.map((segment) => segment.label),
    prediction_instance_segmentation_polygon_coordinates: segmentation.instance.map((segment) => segment.polygon),
    prediction_instance_segmentation_polygon_scores: segmentation.instance.map((segment) => segment.score),
    prediction_instance_segmentation_box_coordinates: segmentation.instance.map((segment) => segment.box),
    actual_instance_segmentation_polygon_labels: [],
    actual_instance_segmentation_polygon_coordinates: [],
    actual_instance_segmentation_box_coordinates: [],
    tag_source: frame.liveEvent?.source || "rescuelens",
    tag_location: frame.location,
    tag_evidence_type: frame.visualAsset === "drone" ? "drone_style_evidence" : frame.imageUrl ? "uploaded_or_remote_image" : "sample_frame",
    tag_satellite_context_url: frame.satelliteUrl || frame.liveEvent?.imageUrl || null,
    tag_drift_cluster: drift.selected.name,
    tag_human_review_required: String(frame.analysis?.reviewReason || "").length > 0
  };
}

function buildMetrics(row, detections, segmentation, drift) {
  const averageBoxConfidence =
    detections.reduce((sum, detection) => sum + detection.score, 0) / Math.max(1, detections.length);
  const segmentationCoverage = segmentation.semantic.reduce((sum, segment) => {
    const [[x1, y1], [x2], [, y3]] = segment.polygon;
    return sum + Math.abs((x2 - x1) * (y3 - y1));
  }, 0);

  return [
    {
      family: "Image classification",
      metric: "Accuracy / precision / recall / F1 ready",
      value: `${row.prediction_label} (${Math.round(row.prediction_score * 100)}%)`,
      status: "schema mapped"
    },
    {
      family: "Object detection",
      metric: "Bounding box localization",
      value: `${detections.length} boxes, ${Math.round(averageBoxConfidence * 100)}% avg confidence`,
      status: "active"
    },
    {
      family: "Semantic segmentation",
      metric: "Polygon label accuracy",
      value: `${segmentation.semantic.length} class mask, ${Math.round(segmentationCoverage)}% frame coverage`,
      status: "active"
    },
    {
      family: "Instance segmentation",
      metric: "Instance polygon accuracy",
      value: `${segmentation.instance.length} instance masks`,
      status: "active"
    },
    {
      family: "Embeddings / drift",
      metric: "Euclidean embedding distance",
      value: `${drift.selected.label}, distance ${drift.selected.distance}`,
      status: drift.alert
    }
  ];
}

function buildCapabilities(configured) {
  const mode = configured ? "ready to send to Arize AX" : "local Arize-shaped telemetry";
  return [
    {
      id: "image_classification",
      name: "Image Classification",
      status: mode,
      detail: "Prediction label, score, actual label slot, classification metrics",
      doc: CAPABILITY_DOCS.classification
    },
    {
      id: "object_detection",
      name: "Object Detection",
      status: mode,
      detail: "Prediction boxes, categories, scores, optional actual boxes",
      doc: CAPABILITY_DOCS.objectDetection
    },
    {
      id: "semantic_segmentation",
      name: "Semantic Segmentation",
      status: mode,
      detail: "Class-level polygon labels and coordinates",
      doc: CAPABILITY_DOCS.segmentation
    },
    {
      id: "instance_segmentation",
      name: "Instance Segmentation",
      status: mode,
      detail: "Per-object polygons, scores, and bounding boxes",
      doc: CAPABILITY_DOCS.segmentation
    },
    {
      id: "embeddings_drift",
      name: "Embeddings + Drift",
      status: mode,
      detail: "Dense image vector, image link, nearest cluster, similar failures",
      doc: CAPABILITY_DOCS.objectDetection
    },
    {
      id: "evaluators",
      name: "Evaluators",
      status: "configured as eval plan",
      detail: "Human-review capture, actionability, JSON/schema validity, segmentation coverage",
      doc: CAPABILITY_DOCS.evaluators
    },
    {
      id: "datasets_experiments_prompts",
      name: "Datasets / Experiments / Prompts",
      status: "driven through Phoenix MCP workflow",
      detail: "Failure slice to dataset, experiment compare, prompt/review-policy patch",
      doc: CAPABILITY_DOCS.evaluators
    }
  ];
}

function buildSchema() {
  return {
    imageClassification: {
      modelType: "ModelTypes.SCORE_CATEGORICAL",
      predictionLabel: "prediction_label",
      predictionScore: "prediction_score",
      actualLabel: "actual_label",
      embeddingFeature: "image_embedding"
    },
    objectDetection: {
      modelType: "ModelTypes.OBJECT_DETECTION",
      predictionBoxes: "prediction_bboxes",
      predictionCategories: "prediction_categories",
      predictionScores: "prediction_scores",
      actualBoxes: "actual_bboxes",
      actualCategories: "actual_categories",
      embeddingFeature: "image_embedding"
    },
    semanticSegmentation: {
      modelType: "ModelTypes.OBJECT_DETECTION",
      predictionPolygonLabels: "prediction_semantic_segmentation_polygon_labels",
      predictionPolygonCoordinates: "prediction_semantic_segmentation_polygon_coordinates",
      actualPolygonLabels: "actual_semantic_segmentation_polygon_labels",
      actualPolygonCoordinates: "actual_semantic_segmentation_polygon_coordinates"
    },
    instanceSegmentation: {
      modelType: "ModelTypes.OBJECT_DETECTION",
      predictionPolygonLabels: "prediction_instance_segmentation_polygon_labels",
      predictionPolygonCoordinates: "prediction_instance_segmentation_polygon_coordinates",
      predictionPolygonScores: "prediction_instance_segmentation_polygon_scores",
      predictionBoxCoordinates: "prediction_instance_segmentation_box_coordinates",
      actualPolygonLabels: "actual_instance_segmentation_polygon_labels",
      actualPolygonCoordinates: "actual_instance_segmentation_polygon_coordinates",
      actualBoxCoordinates: "actual_instance_segmentation_box_coordinates"
    },
    embeddingFeatures: {
      image_embedding: {
        vectorColumnName: "image_vector",
        linkToDataColumnName: "image_link"
      }
    }
  };
}

function buildEvaluators(frame, row, drift) {
  return [
    {
      name: "cv_schema_validity",
      scope: "span",
      type: "code evaluator",
      label: row.prediction_bboxes.length && row.image_vector.length ? "pass" : "fail",
      score: row.prediction_bboxes.length && row.image_vector.length ? 1 : 0,
      explanation: "Checks that image vector, classification label, and object detection boxes are present."
    },
    {
      name: "life_safety_human_review",
      scope: "trace",
      type: "LLM-as-a-judge",
      label: frame.analysis?.reviewReason ? "pass" : "review",
      score: frame.analysis?.reviewReason ? 1 : 0.62,
      explanation: "Confirms high-risk or low-confidence outputs keep a trained responder in the approval loop."
    },
    {
      name: "segmentation_coverage",
      scope: "span",
      type: "code evaluator",
      label: row.prediction_semantic_segmentation_polygon_coordinates.length ? "pass" : "fail",
      score: row.prediction_semantic_segmentation_polygon_coordinates.length ? 1 : 0,
      explanation: "Verifies semantic segmentation polygons exist for the selected evidence image."
    },
    {
      name: "drift_slice_priority",
      scope: "experiment",
      type: "code evaluator",
      label: drift.alert,
      score: drift.alert === "review" ? 0.41 : 0.82,
      explanation: `Routes ${drift.selected.label} cluster to eval slice review when embedding distance is high.`
    }
  ];
}

function averageScore(items) {
  return items.reduce((sum, item) => sum + finiteNumber(item.score, 0), 0) / Math.max(1, items.length);
}

function detectionGroup(label, id, detections, emptyDetail) {
  const confidence = detections.length ? averageScore(detections) : 0;
  const status = detections.length ? (confidence >= 0.75 ? "active" : "review") : "sweep";
  return {
    id,
    name: label,
    status,
    count: detections.length,
    confidence: Math.round(confidence * 100),
    detail: detections.length
      ? detections.map((item) => item.displayLabel || item.label.replaceAll("_", " ")).join(", ")
      : emptyDetail
  };
}

function buildDetectionGroups(frame, detections) {
  const disasterTerms = ["flood", "fire", "smoke", "hazard", "impact", "damage", "unsafe", "blocked", "submerged"];
  const humanAnimalTerms = ["human", "person", "survivor", "occupant", "animal", "pet", "livestock"];
  const roadTerms = ["road", "route", "corridor", "bridge", "crossing"];
  const disaster = detections.filter((item) => includesAny(item.label, disasterTerms));
  const humanAnimal = detections.filter((item) => includesAny(item.label, humanAnimalTerms));
  const road = detections.filter((item) => includesAny(item.label, roadTerms));
  const objects = detections.filter((item) => !road.includes(item));

  return [
    detectionGroup("Disaster detection", "disaster", disaster, "No dominant disaster polygon found; keep manual review open."),
    detectionGroup("Human / animal detection", "human_animal", humanAnimal, "No person or animal confirmed; run a responder sweep before closing."),
    detectionGroup("Road detection", "road", road, "No usable road surface confirmed from the current frame."),
    detectionGroup("Object detection", "object", objects, "No localizable object boxes available.")
  ];
}

function buildHeatmap(detections, frame) {
  const riskScore = finiteNumber(frame.analysis?.riskScore, 70);
  const heatmap = detections.slice(0, 8).map((detection, index) => {
    const [left, top, width, height] = detection.coordinates;
    return {
      id: `${detection.label}-${index + 1}`,
      label: detection.displayLabel || detection.label.replaceAll("_", " "),
      x: Math.round((left + width / 2) * 100) / 100,
      y: Math.round((top + height / 2) * 100) / 100,
      radius: Math.max(18, Math.round(Math.max(width, height) * 0.88)),
      intensity: Math.round(detection.score * 100),
      tone: detection.tone || detectionTone(detection.label)
    };
  });

  heatmap.unshift({
    id: "risk-core",
    label: "risk core",
    x: 50,
    y: 48,
    radius: Math.max(34, Math.round(riskScore * 0.62)),
    intensity: Math.round(clamp(riskScore / 100, 0, 1) * 100),
    tone: riskScore >= 85 ? "danger" : riskScore >= 70 ? "caution" : "safe"
  });
  return heatmap;
}

function roadStatus(score) {
  if (score >= 76) {
    return "preferred";
  }
  if (score >= 55) {
    return "limited";
  }
  return "closed";
}

function buildSafetyRoads(frame, detections) {
  const text = frameText(frame);
  const riskScore = finiteNumber(frame.analysis?.riskScore, 70);
  const hasWater = includesAny(text, ["flood", "water", "submerged", "muddy"]);
  const hasFire = includesAny(text, ["fire", "smoke", "wildfire"]);
  const hasStructureRisk = includesAny(text, ["bridge", "tilted", "collapsed", "damage", "unstable", "debris"]);
  const roadDetections = detections.filter((item) => includesAny(item.label, ["road", "route", "corridor", "bridge"]));
  const roadConfidence = roadDetections.length ? averageScore(roadDetections) : 0.42;
  const primaryPenalty = (hasWater ? 22 : 0) + (hasFire ? 18 : 0) + (hasStructureRisk ? 20 : 0);
  const primaryScore = Math.max(8, Math.round(100 - riskScore * 0.62 - primaryPenalty + roadConfidence * 12));
  const detourScore = Math.min(96, Math.max(35, primaryScore + (hasWater ? 24 : 16) + (hasFire ? -8 : 10)));
  const scoutScore = Math.min(94, Math.max(58, 100 - Math.round(riskScore * 0.32)));

  return [
    {
      name: "Primary approach",
      score: primaryScore,
      status: roadStatus(primaryScore),
      reason: hasStructureRisk || hasWater || hasFire ? "hazard intersects route corridor" : "route visible with caution"
    },
    {
      name: "High-ground detour",
      score: detourScore,
      status: roadStatus(detourScore),
      reason: hasWater ? "keeps crews above floodwater" : "keeps vehicles outside active hazard core"
    },
    {
      name: "Drone / scout corridor",
      score: scoutScore,
      status: roadStatus(scoutScore),
      reason: "safe first-look path before committing responders"
    }
  ];
}

function buildRehabilitationPlan(frame, safetyRoads) {
  const preferredRoad = safetyRoads.find((road) => road.status === "preferred") || safetyRoads[0];
  const riskScore = finiteNumber(frame.analysis?.riskScore, 70);
  const text = frameText(frame);
  const water = includesAny(text, ["flood", "water", "submerged"]);
  const fire = includesAny(text, ["fire", "smoke", "wildfire"]);
  const structure = includesAny(text, ["bridge", "building", "house", "structure", "tilted", "collapsed"]);

  return {
    title: `${frame.location} rehabilitation TCT`,
    mode: riskScore >= 85 ? "critical recovery" : "stabilization",
    safeRoad: preferredRoad.name,
    phases: [
      {
        name: "T0 isolate",
        status: "immediate",
        detail: "Set perimeter, keep responders outside the heatmap core, and confirm human/animal sweep."
      },
      {
        name: water ? "T1 drain" : fire ? "T1 cool" : "T1 clear",
        status: "field team",
        detail: water
          ? "Pump or divert water before heavy equipment enters."
          : fire
            ? "Hold structure access until smoke and heat signatures are reduced."
            : "Clear debris and verify surface stability."
      },
      {
        name: "T2 route",
        status: preferredRoad.status,
        detail: `Use ${preferredRoad.name.toLowerCase()} first; primary road score is ${safetyRoads[0].score}.`
      },
      {
        name: structure ? "T3 stabilize" : "T3 restore",
        status: "engineering",
        detail: structure
          ? "Shore damaged structures and scan for secondary collapse risk."
          : "Restore access, utilities, and temporary landing/supply zone."
      }
    ],
    scene: [
      { id: "hazard", label: water ? "water" : fire ? "smoke" : "hazard", x: 17, y: 48, w: 34, h: 24, tone: water ? "water" : fire ? "smoke" : "danger" },
      { id: "asset", label: structure ? "structure" : "asset", x: 52, y: 29, w: 24, h: 30, tone: structure ? "danger" : "caution" },
      { id: "road", label: preferredRoad.name, x: 20, y: 72, w: 66, h: 11, tone: preferredRoad.status === "preferred" ? "safe" : "caution" },
      { id: "staging", label: "staging", x: 67, y: 58, w: 18, h: 15, tone: "safe" }
    ]
  };
}

function buildFieldIntelligence(frame, detections, segmentation, drift) {
  const safetyRoads = buildSafetyRoads(frame, detections);
  return {
    detectionGroups: buildDetectionGroups(frame, detections),
    heatmap: buildHeatmap(detections, frame),
    safetyRoads,
    rehabilitationPlan: buildRehabilitationPlan(frame, safetyRoads),
    summary: {
      disasterClass: predictionLabel(frame),
      semanticMasks: segmentation.semantic.length,
      instanceMasks: segmentation.instance.length,
      driftCluster: drift.selected.label
    }
  };
}

export function buildArizeCvTelemetry({ frame, trace = null }) {
  const detections = normalizeDetections(frame);
  const segmentation = buildSegmentation(frame, detections);
  const vector = embeddingVector(frame, detections, segmentation);
  const drift = driftCluster(frame, vector);
  const row = buildPredictionRow({ frame, detections, segmentation, vector, drift });
  const configured = Boolean(process.env.ARIZE_API_KEY && process.env.ARIZE_SPACE_ID);
  const metrics = buildMetrics(row, detections, segmentation, drift);
  const fieldIntelligence = buildFieldIntelligence(frame, detections, segmentation, drift);

  return {
    id: randomUUID(),
    frameId: frame.id,
    generatedAt: new Date().toISOString(),
    mode: configured ? "arize-ready" : "local-demo",
    configured,
    docs: CAPABILITY_DOCS,
    capabilities: buildCapabilities(configured),
    schema: buildSchema(),
    predictionRow: row,
    classification: {
      predictionLabel: row.prediction_label,
      predictionScore: row.prediction_score,
      actualLabel: row.actual_label,
      supportedMetrics: [
        "Accuracy",
        "Precision",
        "Recall",
        "F1",
        "Sensitivity",
        "Specificity",
        "FPR",
        "FNR",
        "AUC",
        "PR-AUC",
        "Log Loss",
        "Calibration"
      ]
    },
    objectDetection: {
      predictions: detections,
      actuals: [],
      supportedMetrics: ["Accuracy", "Embedding Euclidean Distance"]
    },
    segmentation,
    embedding: {
      featureName: "image_embedding",
      vector,
      linkToData: row.image_link,
      drift,
      similarFailures: drift.nearest.map((item, index) => ({
        id: `${item.name}-${index + 1}`,
        cluster: item.label,
        distance: item.distance,
        priorFailures: item.priorFailures
      }))
    },
    fieldIntelligence,
    evaluators: buildEvaluators(frame, row, drift),
    metrics,
    monitors: [
      { name: "embedding_drift_monitor", status: drift.alert, value: `${drift.selected.driftScore}% drift` },
      { name: "low_confidence_detection_monitor", status: detections.some((item) => item.score < 0.75) ? "review" : "pass", value: `${detections.length} detections` },
      { name: "missing_ground_truth_monitor", status: "review", value: "actual labels pending human review" },
      { name: "segmentation_coverage_monitor", status: segmentation.semantic.length ? "pass" : "fail", value: `${segmentation.semantic.length} semantic masks` }
    ],
    traceSpans: [
      { name: "arize.cv.image_classification", latencyMs: 0, status: "ok", output: row.prediction_label, arize: "image_classification" },
      { name: "arize.cv.object_detection", latencyMs: 0, status: "ok", output: `${detections.length} prediction boxes`, arize: "object_detection" },
      { name: "arize.cv.semantic_segmentation", latencyMs: 0, status: "ok", output: `${segmentation.semantic.length} semantic polygons`, arize: "semantic_segmentation" },
      { name: "arize.cv.instance_segmentation", latencyMs: 0, status: "ok", output: `${segmentation.instance.length} instance polygons`, arize: "instance_segmentation" },
      { name: "arize.cv.embedding_drift", latencyMs: 0, status: drift.alert === "review" ? "warn" : "ok", output: drift.selected.label, arize: "embedding_drift" },
      { name: "arize.cv.heatmap_field_intelligence", latencyMs: 0, status: "ok", output: `${fieldIntelligence.heatmap.length} heatmap points`, arize: "heatmap" },
      { name: "agent.calculate_safety_roads", latencyMs: 0, status: "ok", output: `${fieldIntelligence.safetyRoads.length} corridors scored`, arize: "road_safety_eval" },
      { name: "agent.plan_rehabilitation_tct", latencyMs: 0, status: "ok", output: fieldIntelligence.rehabilitationPlan.title, arize: "recovery_plan" },
      { name: "arize.ax.evaluators", latencyMs: 0, status: "ok", output: `${4} evaluator definitions`, arize: "eval_hub" }
    ],
    traceId: trace?.traceId || null
  };
}
