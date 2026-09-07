import { authenticate, requireSameOrigin } from "./auth";
import { ApiError, errorResponse } from "./errors";
import { LIMITS } from "./limits";
import { acquireUsage } from "./usage";

export async function runApi(request: Request, action: (signal: AbortSignal) => Promise<Response>): Promise<Response> {
  let release: (() => Promise<void>) | undefined;
  try {
    const principal = authenticate(request);
    requireSameOrigin(request);
    release = await acquireUsage(principal);
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(LIMITS.requestMilliseconds)]);
    signal.throwIfAborted();
    const response = await action(signal);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    return errorResponse(error);
  } finally {
    await release?.();
  }
}

export async function readBytes(stream: ReadableStream<Uint8Array> | null, limit: number, signal: AbortSignal): Promise<Uint8Array<ArrayBuffer>> {
  signal.throwIfAborted();
  if (!stream) return new Uint8Array();
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  const abort = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener("abort", abort, { once: true });
  try {
    while (true) {
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new ApiError(413, "The upload is too large. Please use a shorter answer."); }
      chunks.push(value);
    }
    const result = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
    return result;
  } finally {
    signal.removeEventListener("abort", abort);
    reader.releaseLock();
  }
}

export async function readBody(request: Request, limit: number, signal: AbortSignal) {
  const length = Number(request.headers.get("content-length"));
  if (length > limit) throw new ApiError(413, "The request is too large.");
  return readBytes(request.body, limit, signal);
}

export async function readJson(request: Request, signal: AbortSignal): Promise<unknown> {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    throw new ApiError(415, "Send the request as JSON.");
  }
  const bytes = await readBody(request, LIMITS.jsonBytes, signal);
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new ApiError(400, "The request contains invalid JSON."); }
}
