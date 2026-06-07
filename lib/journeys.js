// lib/journeys.js — Private Jet Atlas query layer
// Shared in-memory query over the jet TRIPS feed, mirroring the Hotel Atlas
// lib/hotels.js contract so the concierge can query jet journeys like hotels.
// Pure functions, one-time JSON load, unit-testable without an HTTP server.

const raw = require("../itinerary.json");

const ATLAS_URL =
  process.env.ATLAS_JET_URL || "https://private-jet-expeditions.vercel.app";

const ci = (s) => String(s == null ? "" : s).toLowerCase().trim();

const Q_STOPWORDS = new Set([
  "in", "the", "of", "at", "on", "a", "an", "and", "to", "for", "near", "or", "by",
  "jet", "jets", "private", "journey", "journeys", "expedition", "expeditions",
  "tour", "tours", "trip", "trips", "flight", "flights",
]);

const MARQUEE = new Set([
  "antarctica", "arctic", "galapagos", "amazon", "polynesia",
  "patagonia", "kimberley", "mediterranean", "norway", "japan", "namibia",
]);
const MARQUEE_CENTER = {
  antarctica: [0, -71], arctic: [18, 79], galapagos: [-90.5, -0.7],
  amazon: [-60, -3], polynesia: [-149.4, -17.6], patagonia: [-72, -49],
  kimberley: [126, -16], mediterranean: [14, 39], norway: [10, 65],
  japan: [138, 37], namibia: [16, -22],
};

// Jet region tag -> marquee key.
const REGION_MARQUEE = {
  ANTARCTICA: "antarctica", AURORA: "arctic", POLY: "polynesia",
  EASTASIA: "japan", SAM: "amazon",
};
const KEYWORDS = [
  ["antarctica", "antarctica"], ["galápagos", "galapagos"], ["galapagos", "galapagos"],
  ["amazon", "amazon"], ["patagonia", "patagonia"], ["kimberley", "kimberley"],
  ["namibia", "namibia"], ["norway", "norway"], ["iceland", "arctic"],
  ["aurora", "arctic"], ["tahiti", "polynesia"], ["japan", "japan"],
];
function marqueeFor(tag, name, regionLabel) {
  const t = `${ci(name)} ${ci(regionLabel)}`;
  for (const [kw, key] of KEYWORDS) if (t.includes(kw)) return key;
  return REGION_MARQUEE[tag] || null;
}

const BRANDS = raw.BRANDS || {};
const REGIONS = raw.REGIONS || {};
const brandName = (b) => (BRANDS[b] && BRANDS[b].short) || b || null;
const regionName = (tag) => (REGIONS[tag] && REGIONS[tag].name) || tag || null;

// "6/16/2026" -> "2026-06"
function ym(d) {
  const m = String(d || "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${String(m[1]).padStart(2, "0")}`;
  const m2 = String(d || "").match(/^(\d{4})-(\d{2})/);
  return m2 ? `${m2[1]}-${m2[2]}` : null;
}

// --- normalize TRIPS -> records --------------------------------------------
const journeys = (raw.TRIPS || []).map((t, i) => {
  const tag = (t.g && t.g[0]) || null;
  const regionLabel = tag ? regionName(tag) : null;
  return {
    id: `jt_${i}`,
    type: "jet",
    name: t.n,
    operator: brandName(t.b),
    brand: brandName(t.b),
    regionLabel,
    region: marqueeFor(tag, t.n, regionLabel),
    country: null,
    startDate: t.d || null,
    endDate: t.r || null,
    month: ym(t.d),
    bookUrl: t.u || ATLAS_URL,
  };
});

// --- filtering -------------------------------------------------------------
function filterJourneys(params = {}) {
  const { q, region, country, month, brand, ids } = params;
  let list = journeys;

  if (ids != null && String(ids).trim() !== "") {
    const set = new Set(String(ids).split(",").map((s) => s.trim()).filter(Boolean));
    list = list.filter((j) => set.has(j.id));
  }
  if (region) { const v = ci(region); if (MARQUEE.has(v)) list = list.filter((j) => j.region === v); }
  if (brand) { const v = ci(brand); list = list.filter((j) => ci(j.brand) === v); }
  if (month) { const v = String(month).trim(); list = list.filter((j) => j.month === v); }

  const hay = (j) => `${ci(j.name)} ${ci(j.brand)} ${ci(j.regionLabel)}`;
  if (country != null && String(country).trim() !== "") {
    const v = ci(country); list = list.filter((j) => hay(j).includes(v));
  }
  if (q != null && String(q).trim() !== "") {
    const tokens = ci(q).split(/\s+/).filter((t) => t && !Q_STOPWORDS.has(t));
    if (tokens.length) list = list.filter((j) => tokens.every((t) => hay(j).includes(t)));
  }
  return list;
}

function clampLimit(rawN) { let n = parseInt(rawN, 10); if (!Number.isFinite(n) || n <= 0) n = 6; if (n > 24) n = 24; return n; }
function clampOffset(rawN) { let n = parseInt(rawN, 10); if (!Number.isFinite(n) || n < 0) n = 0; return n; }

function buildDeepLink(params = {}) {
  const usp = new URLSearchParams();
  for (const k of ["region", "country", "brand", "month", "q"]) {
    const val = params[k];
    if (val != null && String(val).trim() !== "") usp.set(k, String(val).trim());
  }
  const qs = usp.toString();
  return qs ? `${ATLAS_URL}?${qs}` : ATLAS_URL;
}

function regions() {
  const tally = {};
  for (const j of journeys) if (j.region && MARQUEE.has(j.region)) tally[j.region] = (tally[j.region] || 0) + 1;
  const out = Object.keys(tally).map((region) => ({
    region, count: tally[region], center: MARQUEE_CENTER[region] || null,
    deepLink: buildDeepLink({ region }),
  })).sort((a, b) => b.count - a.count);
  const total = out.reduce((n, r) => n + r.count, 0);
  return { total, count: out.length, regions: out };
}

function query(params = {}) {
  const matched = filterJourneys(params);
  const total = matched.length;
  const limit = clampLimit(params.limit);
  const offset = clampOffset(params.offset);
  const results = matched.slice(offset, offset + limit);
  return { total, count: results.length, results, deepLink: buildDeepLink(params) };
}

module.exports = {
  journeys, filterJourneys, clampLimit, clampOffset, buildDeepLink, query, regions,
  MARQUEE, ATLAS_URL,
};
