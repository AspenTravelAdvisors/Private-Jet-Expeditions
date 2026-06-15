// scripts/test-journeys.js — Private Jet Atlas tests
// No framework. Run: node scripts/test-journeys.js

const assert = require("node:assert/strict");
const { journeys, filterJourneys, clampLimit, query, regions, MARQUEE } =
  require("../lib/journeys");
const journeysApi = require("../api/jet-journeys");
const regionsApi = require("../api/regions");

let passed = 0;
function test(name, fn) { fn(); passed++; console.log("  ok  " + name); }
const ci = (s) => String(s == null ? "" : s).toLowerCase();

test("dataset loaded (unique ids, every record has a bookable URL)", () => {
  assert.ok(journeys.length > 50);
  assert.equal(new Set(journeys.map((j) => j.id)).size, journeys.length);
  assert.ok(journeys.every((j) => j.name && j.bookUrl));
});

test("every journey exposes day-by-day itinerary data", () => {
  assert.ok(journeys.every((j) => Array.isArray(j.itinerary) && j.itinerary.length > 0));
  assert.ok(journeys.every((j) => j.days === j.itinerary.length));
  assert.ok(journeys.every((j) => j.itinerary.every((d, i) => d.d === i + 1 && d.n)));
});

test("region filter accepts marquee keys; japan maps from EASTASIA", () => {
  const r = filterJourneys({ region: "japan" });
  assert.ok(r.length > 0);
  assert.ok(r.every((j) => j.region === "japan"));
});

test("q drops genre stopwords: 'japan by private jet' matches Japan", () => {
  const r = filterJourneys({ q: "japan by private jet" });
  assert.ok(r.length > 0);
  assert.ok(r.every((j) => ci(j.name).includes("japan") || ci(j.regionLabel).includes("japan")));
});

test("query paginates with honest total + deepLink", () => {
  const r = query({ region: "japan", limit: 2 });
  assert.ok(r.total >= r.count);
  assert.equal(r.count, Math.min(2, r.total));
  assert.ok(r.deepLink.includes("region=japan"));
});

test("intent ranks with itinerary-fit rows and returns fit metadata", () => {
  const r = query({ region: "japan", intent: "culture", limit: 5 });
  assert.equal(r.count, Math.min(5, r.total));
  assert.ok(r.deepLink.includes("intent=culture"));
  assert.ok(r.results.every((j) => j.fit && j.fit.intent === "culture"));
  for (let i = 1; i < r.results.length; i++) {
    assert.ok(r.results[i - 1].fit.score >= r.results[i].fit.score);
  }
});

test("A&K around-the-world handoff keeps exact shortlist ids", () => {
  const r = query({ brand: "Abercrombie & Kent", world: "true", limit: 24 });
  assert.equal(r.total, 2);
  assert.deepEqual(r.results.map((j) => j.id), ["jt_77", "jt_88"]);
  assert.ok(r.deepLink.includes("brand=Abercrombie+%26+Kent"));
  assert.ok(r.deepLink.includes("world=true"));
});

test("ids filter accepts Guide ids for A&K world journeys", () => {
  const r = query({ ids: "jt_77,jt_88", world: "true", limit: 24 });
  assert.equal(r.total, 2);
  assert.deepEqual(r.results.map((j) => j.id), ["jt_77", "jt_88"]);
});

test("clampLimit default 6, capped at 24", () => {
  assert.equal(clampLimit(undefined), 6);
  assert.equal(clampLimit(100), 24);
});

test("regions returns marquee aggregates with centroids", () => {
  const r = regions();
  assert.ok(r.count > 0);
  assert.ok(r.regions.every((g) => MARQUEE.has(g.region) && Array.isArray(g.center)));
});

function mockRes() {
  return { _s: 200, _j: null, _h: {}, setHeader(k, v) { this._h[k] = v; },
    status(c) { this._s = c; return this; }, json(o) { this._j = o; return this; } };
}
test("GET /api/jet-journeys handler returns query payload", () => {
  const res = mockRes();
  journeysApi({ method: "GET", query: { region: "japan", limit: "2" } }, res);
  assert.equal(res._s, 200);
  assert.ok(res._j.results.length >= 1 && res._j.results[0].bookUrl);
});
test("GET /api/regions handler returns aggregate", () => {
  const res = mockRes();
  regionsApi({ method: "GET", query: {} }, res);
  assert.equal(res._s, 200);
  assert.ok(res._j.regions.length > 0);
});

console.log(`\n${passed} tests passed`);
