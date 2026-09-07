import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { acquireUsage } from "../lib/usage";
import { LIMITS } from "../lib/limits";

beforeEach(() => { vi.stubEnv("UPSTASH_REDIS_REST_URL", ""); vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", ""); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers(); });

it("reserves concurrency synchronously and releases it", async () => {
  const key = randomUUID();
  const release = await Promise.all(Array.from({ length: LIMITS.concurrentRequests }, () => acquireUsage(key)));
  await expect(acquireUsage(key)).rejects.toMatchObject({ status: 429, retryAfter: 5 });
  await release[0](); await expect(acquireUsage(key)).resolves.toBeTypeOf("function");
});
it("enforces rolling-minute quotas after completed requests", async () => {
  const key = randomUUID();
  for (let i = 0; i < LIMITS.requestsPerMinute; i++) await (await acquireUsage(key))();
  await expect(acquireUsage(key)).rejects.toMatchObject({ status: 429, retryAfter: 60 });
});
it("retains daily quotas across minute-window resets", async () => {
  vi.useFakeTimers(); const key = randomUUID();
  for (let i = 0; i < LIMITS.requestsPerDay; i++) {
    vi.advanceTimersByTime(2100); await (await acquireUsage(key))();
  }
  await expect(acquireUsage(key)).rejects.toMatchObject({ status: 429 });
  vi.advanceTimersByTime(86_400_000); await expect(acquireUsage(key)).resolves.toBeTypeOf("function");
});
it("fails closed without a shared limiter in production", async () => {
  vi.stubEnv("NODE_ENV", "production");
  await expect(acquireUsage(randomUUID())).rejects.toMatchObject({ status: 503 });
});
it("fails closed on a Redis outage", async () => {
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.example"); vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "test");
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Offline")));
  await expect(acquireUsage(randomUUID())).rejects.toMatchObject({ status: 503 });
});
it("obeys shared quotas and releases the exact reservation", async () => {
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.example"); vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "test");
  const fetch = vi.fn().mockResolvedValueOnce(Response.json({ result: 0 })).mockResolvedValueOnce(Response.json({ result: 1 })).mockResolvedValueOnce(Response.json({ result: 60 }));
  vi.stubGlobal("fetch", fetch);
  const release = await acquireUsage("test-account"); await release();
  const reserve = JSON.parse(fetch.mock.calls[0][1].body);
  expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual(["ZREM", "gym-talk:{test-account}:active", reserve[6]]);
  await expect(acquireUsage("test-account")).rejects.toMatchObject({ status: 429, retryAfter: 60 });
});
