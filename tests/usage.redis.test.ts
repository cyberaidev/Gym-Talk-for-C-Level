import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";
import { createClient } from "redis";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { acquireUsage } from "../lib/usage";
import { LIMITS } from "../lib/limits";

// CI supplies a disposable Redis service. The HTTP bridge exercises the exact REST/Lua path.
describe.skipIf(!process.env.REDIS_TEST_URL)("shared production quotas with Redis", () => {
  const client = createClient({ url: process.env.REDIS_TEST_URL });
  let server: Server;
  let restUrl: string;
  const realFetch = globalThis.fetch;
  beforeAll(async () => {
    await client.connect();
    server = createServer(async (request, response) => {
      try {
        if (request.headers.authorization !== "Bearer integration-test") { response.writeHead(401).end(); return; }
        const chunks = [];
        for await (const chunk of request) chunks.push(chunk);
        const args = JSON.parse(Buffer.concat(chunks).toString()) as (string | number)[];
        const result = await client.sendCommand(args.map(String));
        response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ result }));
      } catch { response.writeHead(500).end(JSON.stringify({ error: "Test bridge failure" })); }
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No local Redis bridge port");
    restUrl = `http://127.0.0.1:${address.port}`;
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
  afterAll(async () => { await client.quit(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); });

  function useStore() {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis-integration.invalid");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "integration-test");
    vi.stubGlobal("fetch", (url: string, options: RequestInit) => {
      if (url !== "https://redis-integration.invalid") throw new Error("Unexpected network request");
      return realFetch(restUrl, options);
    });
  }
  it("atomically admits only three simultaneous reservations", async () => {
    useStore(); const key = randomUUID();
    const attempts = await Promise.allSettled(Array.from({ length: 10 }, () => acquireUsage(key)));
    const admitted = attempts.filter(result => result.status === "fulfilled");
    expect(admitted).toHaveLength(LIMITS.concurrentRequests);
    expect(attempts.filter(result => result.status === "rejected").every(result => result.reason.status === 429)).toBe(true);
    for (const result of admitted) await result.value();
    await (await acquireUsage(key))();
  });
  it("persists quotas after reservations are released", async () => {
    useStore(); const key = randomUUID();
    for (let i = 0; i < LIMITS.requestsPerMinute; i++) await (await acquireUsage(key))();
    await expect(acquireUsage(key)).rejects.toMatchObject({ status: 429, retryAfter: 60 });
    const dailyKey = randomUUID();
    await client.set(`gym-talk:{${dailyKey}}:day`, String(LIMITS.requestsPerDay), { EX: 86400 });
    await expect(acquireUsage(dailyKey)).rejects.toMatchObject({ status: 429 });
  });
  it("recovers slots left by expired workers", async () => {
    useStore(); const key = randomUUID();
    await client.zAdd(`gym-talk:{${key}}:active`, Array.from({ length: 3 }, (_, i) => ({ score: 1, value: `expired-${i}` })));
    await (await acquireUsage(key))();
  });
});
