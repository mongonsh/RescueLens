const DEFAULT_LIMIT = 24;
const KM_PER_RADIAN = 6371;

function iso(value) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function pointFromGeometry(geometry) {
  if (!geometry) {
    return null;
  }

  if (geometry.type === "Point" && Array.isArray(geometry.coordinates)) {
    const [lon, lat] = geometry.coordinates;
    return { lat, lon };
  }

  const coordinates = geometry.coordinates;
  if (!Array.isArray(coordinates)) {
    return null;
  }

  const flat = coordinates.flat(4).filter((value) => typeof value === "number");
  if (flat.length < 2) {
    return null;
  }

  return { lon: flat[0], lat: flat[1] };
}

function severityFromMagnitude(magnitude) {
  if (magnitude >= 6.5) {
    return "critical";
  }
  if (magnitude >= 5) {
    return "high";
  }
  return "medium";
}

function severityFromNws(value) {
  const severity = String(value || "").toLowerCase();
  if (["extreme", "severe"].includes(severity)) {
    return "critical";
  }
  if (severity === "moderate") {
    return "high";
  }
  return "medium";
}

function severityRank(severity) {
  return { critical: 3, high: 2, medium: 1, low: 0 }[severity] || 0;
}

function imageDate(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) {
    return `${new Date().toISOString().slice(0, 10)}T00:00:00Z`;
  }
  return `${date.toISOString().slice(0, 10)}T00:00:00Z`;
}

function buildWorldviewSnapshotUrl({ lat, lon, time, category }) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }

  const latSpan = 5;
  const lonSpan = Math.max(5, latSpan / Math.max(0.35, Math.cos((lat * Math.PI) / 180)));
  const minLon = Math.max(-180, lon - lonSpan / 2);
  const maxLon = Math.min(180, lon + lonSpan / 2);
  const minLat = Math.max(-85, lat - latSpan / 2);
  const maxLat = Math.min(85, lat + latSpan / 2);
  const layers = [
    { id: "VIIRS_SNPP_CorrectedReflectance_TrueColor", wrap: "day" },
    { id: "Reference_Features_15m", wrap: "x" },
    { id: "Reference_Labels_15m", wrap: "x" }
  ];
  const lowerCategory = String(category || "").toLowerCase();
  if (lowerCategory.includes("fire") || lowerCategory.includes("wildfire")) {
    layers.splice(1, 0, { id: "VIIRS_SNPP_Thermal_Anomalies_375m_Day", wrap: "day" });
  }

  const url = new URL("https://wvs.earthdata.nasa.gov/api/v1/snapshot");
  url.searchParams.set("REQUEST", "GetSnapshot");
  url.searchParams.set("TIME", imageDate(time));
  url.searchParams.set("BBOX", `${minLat.toFixed(4)},${minLon.toFixed(4)},${maxLat.toFixed(4)},${maxLon.toFixed(4)}`);
  url.searchParams.set("CRS", "EPSG:4326");
  url.searchParams.set("LAYERS", layers.map((layer) => layer.id).join(","));
  url.searchParams.set("WRAP", layers.map((layer) => layer.wrap).join(","));
  url.searchParams.set("FORMAT", "image/jpeg");
  url.searchParams.set("WIDTH", "900");
  url.searchParams.set("HEIGHT", "620");
  url.searchParams.set("AUTOSCALE", "TRUE");
  return url.toString();
}

async function fetchJson(url, headers = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.LIVE_DATA_TIMEOUT_MS || 8000));
  try {
    const response = await fetch(url, {
      headers,
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`${response.status} ${await response.text()}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeEonet(payload) {
  return (payload.events || []).map((event) => {
    const latestGeometry = event.geometry?.at(-1);
    const point = pointFromGeometry(latestGeometry);
    const category = event.categories?.[0]?.title || event.categories?.[0]?.id || "Natural event";
    return {
      id: `eonet-${event.id}`,
      source: "NASA EONET",
      sourceUrl: event.link || "https://eonet.gsfc.nasa.gov/",
      title: event.title,
      category,
      severity: category.toLowerCase().includes("wildfire") ? "high" : "medium",
      status: event.closed ? "closed" : "open",
      time: iso(latestGeometry?.date),
      updated: iso(latestGeometry?.date),
      lat: point?.lat,
      lon: point?.lon,
      locationName: point ? `${point.lat.toFixed(2)}, ${point.lon.toFixed(2)}` : "location unavailable",
      description: event.description || `${category} tracked by NASA EONET.`,
      raw: {
        categories: event.categories?.map((item) => item.title || item.id) || [],
        sources: event.sources?.map((item) => item.id || item.url).filter(Boolean) || []
      }
    };
  });
}

function normalizeUsgs(payload) {
  return (payload.features || []).map((feature) => {
    const props = feature.properties || {};
    const [lon, lat, depthKm] = feature.geometry?.coordinates || [];
    return {
      id: `usgs-${feature.id}`,
      source: "USGS Earthquakes",
      sourceUrl: props.url || "https://earthquake.usgs.gov/",
      title: props.title || `M ${props.mag} earthquake`,
      category: "Earthquake",
      severity: severityFromMagnitude(Number(props.mag || 0)),
      status: props.status || "reviewed",
      time: iso(props.time),
      updated: iso(props.updated || props.time),
      lat,
      lon,
      locationName: props.place || "location unavailable",
      description: `Magnitude ${props.mag ?? "unknown"} earthquake at ${props.place || "unknown location"}. Depth ${depthKm ?? "unknown"} km.`,
      raw: {
        magnitude: props.mag,
        depthKm,
        tsunami: props.tsunami,
        felt: props.felt
      }
    };
  });
}

function normalizeNws(payload) {
  return (payload.features || []).map((feature) => {
    const props = feature.properties || {};
    const point = pointFromGeometry(feature.geometry);
    return {
      id: `nws-${props.id || feature.id}`,
      source: "NOAA/NWS Alerts",
      sourceUrl: props["@id"] || "https://api.weather.gov/alerts/active",
      title: props.headline || props.event || "Active weather alert",
      category: props.event || "Weather alert",
      severity: severityFromNws(props.severity),
      status: props.status || "Actual",
      time: iso(props.effective || props.sent),
      updated: iso(props.sent || props.effective),
      lat: point?.lat,
      lon: point?.lon,
      locationName: props.areaDesc || "US alert area",
      description: props.description || props.instruction || props.headline || "Active National Weather Service alert.",
      raw: {
        urgency: props.urgency,
        certainty: props.certainty,
        expires: iso(props.expires)
      }
    };
  });
}

function compactDescription(text, max = 240) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}...` : clean;
}

function distanceKm(a, b) {
  if (!Number.isFinite(a.lat) || !Number.isFinite(a.lon) || !Number.isFinite(b.lat) || !Number.isFinite(b.lon)) {
    return null;
  }

  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;
  return 2 * KM_PER_RADIAN * Math.asin(Math.min(1, Math.sqrt(h)));
}

function cleanEvents(events, limit) {
  const normalized = events
    .filter((event) => event.title)
    .map((event) => ({
      ...event,
      description: compactDescription(event.description),
      riskScore: event.severity === "critical" ? 91 : event.severity === "high" ? 78 : 61,
      imageUrl: buildWorldviewSnapshotUrl(event),
      imageSource: Number.isFinite(event.lat) && Number.isFinite(event.lon) ? "NASA Worldview/GIBS satellite snapshot" : null
    }));

  const bySource = new Map();
  for (const event of normalized) {
    const sourceEvents = bySource.get(event.source) || [];
    sourceEvents.push(event);
    bySource.set(event.source, sourceEvents);
  }

  const mixed = [...bySource.values()].flatMap((sourceEvents) =>
    sourceEvents
      .sort((a, b) => {
        const severityDelta = severityRank(b.severity) - severityRank(a.severity);
        if (severityDelta) {
          return severityDelta;
        }
        return new Date(b.updated || b.time || 0) - new Date(a.updated || a.time || 0);
      })
      .slice(0, Math.max(4, Math.ceil(limit / Math.max(1, bySource.size))))
  );

  return mixed
    .sort((a, b) => {
      const severityDelta = severityRank(b.severity) - severityRank(a.severity);
      if (severityDelta) {
        return severityDelta;
      }
      return new Date(b.updated || b.time || 0) - new Date(a.updated || a.time || 0);
    })
    .slice(0, limit);
}

export async function fetchLiveDisasterData() {
  const limit = Number(process.env.LIVE_DATA_LIMIT || DEFAULT_LIMIT);
  const feeds = [];
  const events = [];

  const tasks = [
    {
      id: "eonet",
      name: "NASA EONET",
      url: "https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days=30&limit=20",
      normalize: normalizeEonet
    },
    {
      id: "usgs",
      name: "USGS Earthquakes",
      url: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson",
      normalize: normalizeUsgs
    },
    {
      id: "nws",
      name: "NOAA/NWS Alerts",
      url: "https://api.weather.gov/alerts/active?status=actual&message_type=alert",
      headers: {
        "user-agent": process.env.NWS_USER_AGENT || "RescueLens disaster response demo; contact=dev@example.com",
        accept: "application/geo+json, application/json"
      },
      normalize: normalizeNws
    }
  ];

  await Promise.all(
    tasks.map(async (task) => {
      try {
        const payload = await fetchJson(task.url, task.headers);
        const normalized = task.normalize(payload).slice(0, limit);
        events.push(...normalized);
        feeds.push({
          id: task.id,
          name: task.name,
          status: "live",
          count: normalized.length,
          url: task.url
        });
      } catch (error) {
        feeds.push({
          id: task.id,
          name: task.name,
          status: "unavailable",
          count: 0,
          url: task.url,
          error: error instanceof Error ? error.message : "Fetch failed"
        });
      }
    })
  );

  return {
    generatedAt: new Date().toISOString(),
    feeds,
    events: cleanEvents(events, limit)
  };
}

export async function searchLiveEventsByLocation(query) {
  const search = String(query || "").trim();
  if (!search) {
    throw new Error("Missing location query");
  }

  const normalizedPlaces =
    process.env.LOCATION_GEOCODER === "nominatim"
      ? await geocodeWithNominatim(search)
      : await geocodeWithOpenMeteo(search);

  if (!normalizedPlaces.length) {
    return {
      query: search,
      geocoder: process.env.LOCATION_GEOCODER === "nominatim" ? "OpenStreetMap Nominatim" : "Open-Meteo Geocoding",
      places: [],
      liveData: await fetchLiveDisasterData(),
      nearestEvents: []
    };
  }

  const selectedPlace = normalizedPlaces[0];
  const liveData = await fetchLiveDisasterData();
  const nearestEvents = liveData.events
    .map((event) => ({
      ...event,
      distanceKm: distanceKm(selectedPlace, event)
    }))
    .sort((a, b) => {
      if (a.distanceKm === null && b.distanceKm === null) {
        return 0;
      }
      if (a.distanceKm === null) {
        return 1;
      }
      if (b.distanceKm === null) {
        return -1;
      }
      return a.distanceKm - b.distanceKm;
    })
    .slice(0, Number(process.env.LOCATION_SEARCH_EVENT_LIMIT || 12));

  return {
    query: search,
    geocoder: process.env.LOCATION_GEOCODER === "nominatim" ? "OpenStreetMap Nominatim" : "Open-Meteo Geocoding",
    place: selectedPlace,
    places: normalizedPlaces,
    liveData,
    nearestEvents
  };
}

async function geocodeWithOpenMeteo(search) {
  const geocodeUrl = new URL("https://geocoding-api.open-meteo.com/v1/search");
  geocodeUrl.searchParams.set("name", search);
  geocodeUrl.searchParams.set("count", "8");
  geocodeUrl.searchParams.set("language", "en");
  geocodeUrl.searchParams.set("format", "json");

  const payload = await fetchJson(geocodeUrl, {
    accept: "application/json"
  });

  return (payload.results || [])
    .map((place) => {
      const parts = [place.name, place.admin1, place.country].filter(Boolean);
      return {
        id: String(place.id),
        name: parts.join(", "),
        lat: Number(place.latitude),
        lon: Number(place.longitude),
        category: "place",
        type: place.feature_code || "location",
        importance: Number(place.population || 0)
      };
    })
    .filter((place) => Number.isFinite(place.lat) && Number.isFinite(place.lon));
}

async function geocodeWithNominatim(search) {
  const geocodeUrl = new URL("https://nominatim.openstreetmap.org/search");
  geocodeUrl.searchParams.set("q", search);
  geocodeUrl.searchParams.set("format", "jsonv2");
  geocodeUrl.searchParams.set("limit", "5");
  geocodeUrl.searchParams.set("addressdetails", "1");

  const places = await fetchJson(geocodeUrl, {
    "user-agent": process.env.NOMINATIM_USER_AGENT || "RescueLens disaster response demo; contact=dev@example.com",
    referer: process.env.NOMINATIM_REFERER || "http://localhost:3000",
    accept: "application/json"
  });

  return places
    .map((place) => ({
      id: String(place.place_id),
      name: place.display_name,
      lat: Number(place.lat),
      lon: Number(place.lon),
      category: place.category,
      type: place.type,
      importance: Number(place.importance || 0)
    }))
    .filter((place) => Number.isFinite(place.lat) && Number.isFinite(place.lon));
}
