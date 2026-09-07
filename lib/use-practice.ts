"use client";

import { useEffect, useRef, useState } from "react";
import { PERSONA_QUESTIONS } from "./prompts";
import { LIMITS } from "./limits";
import { coachResult } from "./validation";
import type { CoachResult, Persona } from "./types";

type Phase = "ready" | "starting" | "recording" | "transcribing" | "scoring" | "speaking";
type Attempt = { blob: Blob; durationSeconds: number; persona: Persona; question: string };
type Capture = { recorder: MediaRecorder; stream: MediaStream; timer?: ReturnType<typeof setTimeout> };
type Playback = { audio: HTMLAudioElement; url: string };

function releaseCapture(capture: Capture | null) {
  if (!capture) return;
  clearTimeout(capture.timer);
  capture.recorder.onstop = null;
  capture.recorder.ondataavailable = null;
  capture.recorder.onerror = null;
  try { if (capture.recorder.state !== "inactive") capture.recorder.stop(); }
  catch { /* Track cleanup must also run when the recorder has already failed. */ }
  finally { capture.stream.getTracks().forEach(track => track.stop()); }
}
function releasePlayback(playback: Playback | null) {
  if (!playback) return;
  playback.audio.onended = null;
  playback.audio.onerror = null;
  playback.audio.pause();
  playback.audio.removeAttribute("src");
  playback.audio.load();
  URL.revokeObjectURL(playback.url);
}
function message(error: unknown) {
  const name = error && typeof error === "object" && "name" in error ? error.name : "";
  if (name === "AbortError" || name === "TimeoutError") return "The request timed out. Please try again.";
  if (name === "NotAllowedError") return "Allow microphone access in your browser, then try again.";
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}
async function payload(response: Response): Promise<unknown> {
  const value = await response.json().catch(() => null);
  if (!response.ok) throw new Error(value?.error || `The service returned an error (${response.status}). Please try again.`);
  return value;
}
async function request(url: string, init: RequestInit, controller: AbortController) {
  return fetch(url, { ...init, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(70_000)]) });
}

export function usePractice() {
  const [persona, setPersona] = useState<Persona>("CEO");
  const [questionIndex, setQuestionIndex] = useState(0);
  const [question, setQuestion] = useState(PERSONA_QUESTIONS.CEO[0]);
  const [phase, setPhaseState] = useState<Phase>("ready");
  const [status, setStatus] = useState("Ready");
  const [transcript, setTranscript] = useState("");
  const [result, setResult] = useState<CoachResult | null>(null);
  const [retryAudio, setRetryAudio] = useState<string | null>(null);
  const [canRetry, setCanRetry] = useState(false);
  const phaseRef = useRef<Phase>("ready");
  const generation = useRef(0);
  const capture = useRef<Capture | null>(null);
  const playback = useRef<Playback | null>(null);
  const pending = useRef<AbortController | null>(null);
  const lastAttempt = useRef<Attempt | null>(null);
  const finish = useRef<(() => void) | null>(null);

  useEffect(() => () => {
    generation.current++;
    pending.current?.abort();
    releaseCapture(capture.current); capture.current = null;
    releasePlayback(playback.current); playback.current = null;
    lastAttempt.current = null;
  }, []);

  function setPhase(next: Phase) { phaseRef.current = next; setPhaseState(next); }
  function available() { return phaseRef.current === "ready" || phaseRef.current === "speaking"; }
  function invalidate() {
    const id = ++generation.current;
    pending.current?.abort(); pending.current = null;
    releaseCapture(capture.current); capture.current = null;
    releasePlayback(playback.current); playback.current = null;
    finish.current = null;
    setRetryAudio(null); setCanRetry(false);
    return id;
  }

  async function play(text: string, id: number) {
    if (id !== generation.current) return;
    pending.current?.abort();
    releasePlayback(playback.current); playback.current = null;
    const controller = new AbortController(); pending.current = controller;
    setRetryAudio(null); setPhase("speaking"); setStatus("Preparing coaching audio…");
    try {
      const response = await request("/api/speak", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) }, controller);
      if (!response.ok) await payload(response);
      const blob = await response.blob();
      if (id !== generation.current) return;
      if (!blob.size) throw new Error("No audio was returned. Please try again.");
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url); playback.current = { audio, url };
      const complete = (error = false) => {
        if (id !== generation.current || playback.current?.audio !== audio) return;
        releasePlayback(playback.current); playback.current = null;
        setPhase("ready"); setStatus(error ? "Audio could not play. Use Retry audio." : "Coach ready");
        if (error) setRetryAudio(text);
      };
      audio.onended = () => complete();
      audio.onerror = () => complete(true);
      await audio.play();
      if (id === generation.current && playback.current?.audio === audio) setStatus("Playing coaching…");
    } catch (error) {
      if (id !== generation.current) return;
      releasePlayback(playback.current); playback.current = null;
      const reason = error && typeof error === "object" && "name" in error && error.name === "NotAllowedError"
        ? "Your browser blocked audio playback." : message(error);
      setPhase("ready"); setStatus(`${reason} Use Retry audio.`); setRetryAudio(text);
    }
  }

  async function analyse(attempt: Attempt, id: number) {
    const controller = new AbortController(); pending.current = controller;
    setPhase("transcribing"); setStatus("Transcribing your answer…");
    try {
      const form = new FormData();
      const type = attempt.blob.type.split(";")[0];
      const extension = type.includes("mp4") ? "mp4" : type.includes("ogg") ? "ogg" : type.includes("wav") ? "wav" : "webm";
      form.append("audio", attempt.blob, `answer.${extension}`);
      const stt = await payload(await request("/api/transcribe", { method: "POST", body: form }, controller));
      if (id !== generation.current) return;
      if (!stt || typeof stt !== "object" || !("text" in stt) || typeof stt.text !== "string" || !stt.text.trim()) throw new Error("No speech was detected. Please record again.");
      setTranscript(stt.text); setPhase("scoring"); setStatus("Scoring your executive answer…");
      const value = await payload(await request("/api/coach", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ persona: attempt.persona, question: attempt.question, durationSeconds: attempt.durationSeconds, transcript: stt.text })
      }, controller));
      if (id !== generation.current) return;
      const parsed = coachResult.safeParse(value);
      if (!parsed.success) throw new Error("The coach returned an invalid scorecard. Please try again.");
      setResult(parsed.data); setCanRetry(false); lastAttempt.current = null;
      await play(`${parsed.data.coaching} Here is a stronger version. ${parsed.data.executiveRewrite}`, id);
    } catch (error) {
      if (id !== generation.current) return;
      setPhase("ready"); setStatus(message(error)); setCanRetry(true);
    }
  }

  async function startRecording() {
    if (!available()) return;
    const id = invalidate();
    setPhase("starting"); setStatus("Waiting for microphone access…");
    setResult(null); setTranscript(""); lastAttempt.current = null;
    let stream: MediaStream | undefined;
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") throw new Error("Recording is unavailable. Use a supported browser over HTTPS or localhost.");
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (id !== generation.current) { stream.getTracks().forEach(track => track.stop()); return; }
      const mimeType = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"].find(type => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const current: Capture = { recorder, stream }; capture.current = current;
      const chunks: Blob[] = []; let bytes = 0; let stoppedAt: number | undefined;
      const startedAt = performance.now();
      const fail = (error: unknown) => {
        if (id !== generation.current) return;
        invalidate(); setPhase("ready"); setStatus(message(error));
      };
      const stop = () => {
        if (id !== generation.current || recorder.state !== "recording" || stoppedAt !== undefined) return;
        stoppedAt = performance.now(); clearTimeout(current.timer);
        setPhase("transcribing"); setStatus("Finishing your recording…");
        try { recorder.stop(); } catch (error) { fail(error); }
      };
      finish.current = stop;
      recorder.ondataavailable = event => {
        if (id !== generation.current || !event.data.size) return;
        bytes += event.data.size;
        if (bytes > LIMITS.audioBytes) { fail(new Error("The recording is too large. Please use a shorter answer.")); return; }
        chunks.push(event.data);
      };
      recorder.onerror = () => fail(new Error("The microphone stopped unexpectedly. Please try again."));
      recorder.onstop = () => {
        clearTimeout(current.timer); current.stream.getTracks().forEach(track => track.stop());
        if (id !== generation.current) return;
        capture.current = null; finish.current = null;
        const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        if (!blob.size) { setPhase("ready"); setStatus("No audio was recorded. Please try again."); return; }
        const attempt = { blob, persona, question, durationSeconds: Math.max(0.1, Math.min(LIMITS.recordingSeconds, ((stoppedAt ?? performance.now()) - startedAt) / 1000)) };
        lastAttempt.current = attempt;
        void analyse(attempt, id);
      };
      recorder.start(1000);
      setPhase("recording"); setStatus("Listening…");
      current.timer = setTimeout(stop, LIMITS.recordingSeconds * 1000);
    } catch (error) {
      stream?.getTracks().forEach(track => track.stop());
      if (id !== generation.current) return;
      invalidate(); setPhase("ready"); setStatus(message(error));
    }
  }

  function resetQuestion(nextPersona: Persona, nextQuestion: string, index: number) {
    if (!available()) return;
    invalidate(); lastAttempt.current = null;
    setPersona(nextPersona); setQuestion(nextQuestion); setQuestionIndex(index);
    setTranscript(""); setResult(null); setPhase("ready"); setStatus("Ready");
  }
  function changePersona(next: Persona) { resetQuestion(next, PERSONA_QUESTIONS[next][0], 0); }
  function nextQuestion() {
    const index = (questionIndex + 1) % PERSONA_QUESTIONS[persona].length;
    resetQuestion(persona, PERSONA_QUESTIONS[persona][index], index);
  }
  function followUp() { if (result) resetQuestion(persona, result.followUpQuestion, questionIndex); }
  function cancel() { invalidate(); lastAttempt.current = null; setPhase("ready"); setStatus("Ready"); }
  function speak(text: string) { if (available()) void play(text, invalidate()); }
  function retryAnalysis() {
    if (!available() || !lastAttempt.current) return;
    const attempt = lastAttempt.current;
    void analyse(attempt, invalidate());
  }
  return { persona, question, phase, status, transcript, result, retryAudio, canRetry,
    busy: !["ready", "speaking"].includes(phase), startRecording, stopRecording: () => finish.current?.(),
    changePersona, nextQuestion, followUp, cancel, speak, retryAnalysis };
}
