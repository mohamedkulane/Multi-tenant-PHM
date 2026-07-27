const baseUrl = process.env.PHMS_API_URL ?? "http://127.0.0.1:5001/api/v1";
const branchId = process.env.PHMS_BRANCH_ID;
const cookie = process.env.PHMS_SESSION_COOKIE;
const concurrency = Number(process.env.PHMS_LOAD_CONCURRENCY ?? 10);
const requests = Number(process.env.PHMS_LOAD_REQUESTS ?? 100);

if (!branchId || !cookie) {
  throw new Error("PHMS_BRANCH_ID and PHMS_SESSION_COOKIE are required");
}

const durations = [];
let failures = 0;
let cursor = 0;
async function worker() {
  while (cursor < requests) {
    cursor += 1;
    const started = performance.now();
    const response = await fetch(`${baseUrl}/inventory/stock?branchId=${branchId}`, {
      headers: { cookie: `phms_session=${cookie}`, accept: "application/json" },
    });
    durations.push(performance.now() - started);
    if (!response.ok) failures += 1;
  }
}

await Promise.all(Array.from({ length: concurrency }, () => worker()));
durations.sort((a, b) => a - b);
const percentile = (p) =>
  durations[Math.min(durations.length - 1, Math.floor(durations.length * p))];
const result = {
  requests,
  concurrency,
  failures,
  p50Ms: Math.round(percentile(0.5)),
  p95Ms: Math.round(percentile(0.95)),
  p99Ms: Math.round(percentile(0.99)),
};
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (failures > 0 || result.p95Ms > 1000) process.exitCode = 2;
