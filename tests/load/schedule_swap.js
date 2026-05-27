import http from "k6/http";
import { check } from "k6";
import { Trend } from "k6/metrics";

// k6 budget gate for the hot read paths (research NFR table):
//   Postgres day-window query  p95 ≤ 5 ms  (loopback) / relaxed to ≤ 50 ms over HTTP
//   free-slots query           p95 ≤ 10 ms
// htmx partial swap server time p95 ≤ 50 ms / p99 ≤ 120 ms — measured via the OTel
//   kairos_htmx_partial_swap_seconds histogram in Grafana; here we gate the HTTP read paths.

const dayMs = new Trend("day_query_ms", true);
const slotsMs = new Trend("slots_query_ms", true);

const BASE = __ENV.KAIROS_BASE_URL || "http://localhost:5080";

export const options = {
  vus: 5,
  duration: "20s",
  thresholds: {
    "day_query_ms": ["p(95)<50", "p(99)<120"],
    "slots_query_ms": ["p(95)<60"],
    "http_req_failed": ["rate<0.01"],
  },
};

export default function () {
  const today = new Date().toISOString().slice(0, 10);

  const day = http.get(`${BASE}/api/days/${today}?tz=UTC`, { tags: { name: "day" } });
  check(day, { "day 200": (r) => r.status === 200 });
  dayMs.add(day.timings.duration);

  const from = `${today}T07:00:00Z`;
  const to = `${today}T21:00:00Z`;
  const slots = http.get(`${BASE}/api/slots?from=${from}&to=${to}&estimate=30&take=5`, { tags: { name: "slots" } });
  check(slots, { "slots 200": (r) => r.status === 200 });
  slotsMs.add(slots.timings.duration);
}
