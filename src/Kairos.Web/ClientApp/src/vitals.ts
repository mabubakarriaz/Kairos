import { onINP, onLCP, onCLS, type Metric } from "web-vitals";

// Report Core Web Vitals. observability-builder turns this into an OTel custom metric
// (input latency / INP budget); for now we POST to a lightweight beacon endpoint when present
// and always log in dev so the signal is visible.
function report(metric: Metric): void {
  const body = JSON.stringify({ name: metric.name, value: metric.value, id: metric.id });
  if (navigator.sendBeacon) {
    try {
      navigator.sendBeacon("/api/vitals", new Blob([body], { type: "application/json" }));
    } catch {
      /* endpoint optional until observability-builder wires it */
    }
  }
  if (import.meta.env.DEV) console.debug("[web-vitals]", metric.name, Math.round(metric.value));
}

onINP(report);
onLCP(report);
onCLS(report);
