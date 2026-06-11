# Arize CV Mapping

This project intentionally maps the disaster-response workflow onto Arize computer vision concepts.

## Image classification

RescueLens classifies each frame by scene and urgency:

- `flood_urban`
- `blocked_route`
- `wildfire_smoke`
- `bridge_damage`
- `urgent_review`
- `safe_to_monitor`

These labels support recall, precision, false-negative, calibration, and slice-based evals.

## Object detection

The demo overlays bounding boxes for operational objects:

- possible survivors
- rooftops and roof access
- blocked roads
- vehicles
- debris fields
- smoke plumes
- exposed structures
- damaged bridges
- possible landing zones

These detections are the action layer of the product because they drive dispatch, route closure, and human review.

## Segmentation

RescueLens now emits Arize-shaped polygon masks for:

- floodwater boundary
- smoke boundary
- unsafe bridge edge
- road washout
- landing zone

For uploaded/sample frames, instance masks are derived from the detected objects. For live public incidents, the mask is an agent-generated hazard-region proposal from the incident category and coordinates until field imagery or ground-truth masks are uploaded. This gives responders spatial regions instead of only boxes while keeping human validation explicit.

## Embeddings

Every selected frame produces an Arize image embedding payload with an `image_vector` and `image_link`. Embeddings support:

- UMAP cluster inspection
- drift detection
- similarity search
- failure slice creation

In local mode the vector is a deterministic disaster-feature embedding so the app runs without external dependencies. With Arize credentials, this payload is ready to send as a real image embedding feature. The highlighted failure slice is `low_light_water_glare`.

## Drift

Disaster imagery drifts quickly because the environment changes. RescueLens tracks:

- low-light water glare
- smoke occlusion
- new debris patterns
- damaged infrastructure patterns

The demo's improvement loop starts when drift exposes a cluster of urgent frames with weak small-object recall.

## Similarity search

When a reviewer finds one miss, Phoenix MCP can retrieve similar traces and Arize can retrieve visually similar frames. RescueLens uses those matches to create a focused eval set instead of manually hunting through all images.

## Self-improvement loop

1. Trace a weak decision.
2. Emit Arize CV telemetry for classification, object detection, semantic segmentation, instance segmentation, image embeddings, and drift.
3. Query similar failures through Phoenix MCP.
4. Find the matching Arize CV embedding cluster.
5. Create an eval slice.
6. Patch the Gemini vision checklist and review threshold.
7. Rerun evals and show measured improvement.
