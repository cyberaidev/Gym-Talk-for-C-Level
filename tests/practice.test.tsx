// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePractice } from "../lib/use-practice";
import Home from "../app/page";
import { deferred, feedback } from "./fixture";
import { LIMITS } from "../lib/limits";

let now: number;
let streams: { stop: ReturnType<typeof vi.fn>; stream: MediaStream }[];
let recorders: Recorder[];
let sounds: Sound[];
let provider: ReturnType<typeof vi.fn<(url: string, init: RequestInit) => Promise<Response>>>;
let getUserMedia: ReturnType<typeof vi.fn>;
let permissionFailure: Error | undefined;
let recorderFailure = false;
let playbackFailure = false;

function stream() {
  const stop = vi.fn();
  const value = { getTracks: () => [{ stop }] } as unknown as MediaStream;
  streams.push({ stop, stream: value }); return value;
}
class Recorder {
  static isTypeSupported = () => true;
  state = "inactive";
  mimeType: string;
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public stream: MediaStream, options?: { mimeType?: string }) {
    if (recorderFailure) throw new Error("Recorder failed");
    this.mimeType = options?.mimeType || "audio/webm"; recorders.push(this);
  }
  start() { this.state = "recording"; }
  stop() {
    this.state = "inactive";
    queueMicrotask(() => { this.ondataavailable?.({ data: new Blob(["recorded audio"], { type: this.mimeType }) }); this.onstop?.(); });
  }
}
class Sound {
  paused = true;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public src: string) { sounds.push(this); }
  async play() { if (playbackFailure) throw new DOMException("Autoplay blocked", "NotAllowedError"); this.paused = false; }
  pause() { this.paused = true; }
  removeAttribute() { this.src = ""; }
  load() {}
}

beforeEach(() => {
  now = 1000; streams = []; recorders = []; sounds = []; permissionFailure = undefined; recorderFailure = false; playbackFailure = false;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  getUserMedia = vi.fn(async () => { if (permissionFailure) throw permissionFailure; return stream(); });
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
  vi.stubGlobal("MediaRecorder", Recorder); vi.stubGlobal("Audio", Sound);
  vi.stubGlobal("URL", class extends URL { static createObjectURL = vi.fn(() => "blob:test"); static revokeObjectURL = vi.fn(); });
  provider = vi.fn(async (url: string) => {
    if (url === "/api/transcribe") return Response.json({ text: "Approve the pilot." });
    if (url === "/api/coach") return Response.json(feedback);
    if (url === "/api/speak") return new Response("audio");
    throw Error(`Unexpected network request: ${url}`);
  });
  vi.stubGlobal("fetch", provider);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("recording ownership", () => {
  it("reserves the microphone before awaiting permission", async () => {
    const permission = deferred<MediaStream>(); getUserMedia.mockReturnValue(permission.promise);
    const { result } = renderHook(usePractice);
    let first!: Promise<void>;
    act(() => { first = result.current.startRecording(); void result.current.startRecording(); });
    expect(getUserMedia).toHaveBeenCalledTimes(1); expect(result.current.phase).toBe("starting");
    await act(async () => { permission.resolve(stream()); await first; });
    expect(recorders).toHaveLength(1);
    await act(async () => result.current.stopRecording());
    expect(streams[0].stop).toHaveBeenCalled();
  });
  it("recovers from permission denial and constructor failure", async () => {
    permissionFailure = new DOMException("Denied", "NotAllowedError");
    const { result } = renderHook(usePractice);
    await act(async () => result.current.startRecording());
    expect(result.current.phase).toBe("ready"); expect(result.current.status).toContain("Allow microphone");
    permissionFailure = undefined; recorderFailure = true;
    await act(async () => result.current.startRecording());
    expect(result.current.phase).toBe("ready"); expect(streams[0].stop).toHaveBeenCalled();
  });
  it("releases a stream whose permission resolves after cancellation", async () => {
    const permission = deferred<MediaStream>(); getUserMedia.mockReturnValue(permission.promise);
    const { result, unmount } = renderHook(usePractice);
    let start!: Promise<void>; act(() => { start = result.current.startRecording(); });
    unmount();
    await act(async () => { permission.resolve(stream()); await start; });
    expect(streams[0].stop).toHaveBeenCalled(); expect(recorders).toHaveLength(0); expect(provider).not.toHaveBeenCalled();
  });
  it("stops recording and releases microphone on unmount", async () => {
    const { result, unmount } = renderHook(usePractice);
    await act(async () => result.current.startRecording()); unmount();
    expect(streams[0].stop).toHaveBeenCalled(); expect(recorders[0].state).toBe("inactive");
    await act(async () => {}); expect(provider).not.toHaveBeenCalled();
  });
  it("freezes each recording's own duration before transcription", async () => {
    const ordinary = provider.getMockImplementation()!;
    provider.mockImplementation(async (url: string, init: RequestInit) => { if (url === "/api/transcribe") now += 5000; return ordinary(url, init); });
    const { result } = renderHook(usePractice);
    await act(async () => result.current.startRecording()); now += 45_000;
    await act(async () => result.current.stopRecording());
    await waitFor(() => expect(result.current.result).not.toBeNull());
    now += 155_000; await act(async () => result.current.startRecording()); now += 45_000;
    await act(async () => result.current.stopRecording());
    await waitFor(() => expect(result.current.result).not.toBeNull());
    const requests = provider.mock.calls.filter(([url]) => url === "/api/coach").map(([, init]) => JSON.parse(String(init.body)));
    expect(requests.map(body => body.durationSeconds)).toEqual([45, 45]);
  });
  it("automatically stops at the recording limit", async () => {
    vi.useFakeTimers(); const { result } = renderHook(usePractice);
    await act(async () => result.current.startRecording()); now += LIMITS.recordingSeconds * 1000;
    await act(async () => vi.advanceTimersByTimeAsync(LIMITS.recordingSeconds * 1000));
    expect(recorders[0].state).toBe("inactive"); expect(streams[0].stop).toHaveBeenCalled();
  });
});

describe("session transitions", () => {
  it("blocks conflicting actions and ignores cancelled responses", async () => {
    const pending = deferred<Response>(); const ordinary = provider.getMockImplementation()!;
    provider.mockImplementation((url: string, init: RequestInit) => url === "/api/coach" ? pending.promise : ordinary(url, init));
    const { result } = renderHook(usePractice);
    await act(async () => result.current.startRecording()); now += 45000;
    await act(async () => result.current.stopRecording());
    await waitFor(() => expect(result.current.phase).toBe("scoring"));
    await act(async () => { result.current.changePersona("CFO"); await result.current.startRecording(); });
    expect(result.current.persona).toBe("CEO"); expect(recorders).toHaveLength(1);
    act(() => { result.current.cancel(); result.current.changePersona("CFO"); });
    await act(async () => result.current.startRecording());
    await act(async () => pending.resolve(Response.json(feedback)));
    expect(result.current.phase).toBe("recording"); expect(result.current.persona).toBe("CFO"); expect(result.current.result).toBeNull(); expect(sounds).toHaveLength(0);
  });
  it("uses the generated follow-up for the next coaching request", async () => {
    render(<Home />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /Answer aloud/ })));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /Finish answer/ })));
    await screen.findByRole("button", { name: "Answer follow-up" });
    fireEvent.click(screen.getByRole("button", { name: "Answer follow-up" }));
    expect(screen.getByRole("heading", { level: 3 }).textContent).toBe(feedback.followUpQuestion);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /Answer aloud/ })));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /Finish answer/ })));
    await waitFor(() => expect(provider.mock.calls.filter(([url]) => url === "/api/coach")).toHaveLength(2));
    const sent = provider.mock.calls.filter(([url]) => url === "/api/coach").at(-1)![1];
    expect(JSON.parse(String(sent.body)).question).toBe(feedback.followUpQuestion);
  });
  it("retries failed analysis with the captured question and duration", async () => {
    provider.mockResolvedValueOnce(new Response("Not JSON", { status: 502 }));
    const { result } = renderHook(usePractice);
    await act(async () => result.current.startRecording()); now += 45000;
    await act(async () => result.current.stopRecording());
    await waitFor(() => expect(result.current.canRetry).toBe(true));
    expect(result.current.status).toContain("502");
    act(() => result.current.retryAnalysis());
    await waitFor(() => expect(result.current.result).not.toBeNull());
    expect(recorders).toHaveLength(1);
    expect(JSON.parse(String(provider.mock.calls.find(([url]) => url === "/api/coach")![1].body)).durationSeconds).toBe(45);
  });
});

describe("playback lifecycle", () => {
  it("stops audio and revokes its URL before another recording", async () => {
    const { result } = renderHook(usePractice);
    act(() => result.current.speak("Try this answer"));
    await waitFor(() => expect(sounds).toHaveLength(1)); expect(sounds[0].paused).toBe(false);
    await act(async () => result.current.startRecording());
    expect(sounds[0].paused).toBe(true); expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:test");
  });
  it("shows failed synthesis and offers a retry", async () => {
    provider.mockResolvedValueOnce(Response.json({ error: "Speech unavailable" }, { status: 503 }));
    const { result } = renderHook(usePractice);
    act(() => result.current.speak("Retry this"));
    await waitFor(() => expect(result.current.retryAudio).toBe("Retry this"));
    expect(result.current.status).toContain("Speech unavailable"); expect(sounds).toHaveLength(0);
    act(() => result.current.speak(result.current.retryAudio!));
    await waitFor(() => expect(sounds).toHaveLength(1)); expect(result.current.retryAudio).toBeNull();
  });
  it("handles browser autoplay rejection and releases audio", async () => {
    playbackFailure = true; const { result } = renderHook(usePractice);
    act(() => result.current.speak("Try playback"));
    await waitFor(() => expect(result.current.retryAudio).toBe("Try playback"));
    expect(result.current.phase).toBe("ready"); expect(URL.revokeObjectURL).toHaveBeenCalled();
  });
});
