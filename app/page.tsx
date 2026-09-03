"use client";

import { useMemo, useRef, useState } from "react";
import { PERSONA_QUESTIONS } from "../lib/prompts";
import type { CoachResult, Persona } from "../lib/types";

const personas = Object.keys(PERSONA_QUESTIONS) as Persona[];

export default function Home() {
  const [persona, setPersona] = useState<Persona>("CEO");
  const [questionIndex, setQuestionIndex] = useState(0);
  const [recording, setRecording] = useState(false);
  const [status, setStatus] = useState("Ready");
  const [transcript, setTranscript] = useState("");
  const [result, setResult] = useState<CoachResult | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const questions = PERSONA_QUESTIONS[persona];
  const question = questions[questionIndex % questions.length];
  const scoreRows = useMemo(() => result ? [
    ["Answer first", result.scores.answerFirst],
    ["Clarity", result.scores.clarity],
    ["Conciseness", result.scores.conciseness],
    ["Business impact", result.scores.businessImpact],
    ["Evidence", result.scores.evidence],
    ["Executive presence", result.scores.executivePresence]
  ] as const : [], [result]);

  function changePersona(next: Persona) {
    setPersona(next);
    setQuestionIndex(0);
    setTranscript("");
    setResult(null);
  }

  async function startRecording() {
    setResult(null);
    setTranscript("");
    setStatus("Listening…");
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    chunksRef.current = [];
    recorder.ondataavailable = (event) => event.data.size && chunksRef.current.push(event.data);
    recorder.onstop = async () => {
      stream.getTracks().forEach((track) => track.stop());
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
      await analyse(blob);
    };
    recorderRef.current = recorder;
    setStartedAt(Date.now());
    recorder.start();
    setRecording(true);
  }

  function stopRecording() {
    recorderRef.current?.stop();
    setRecording(false);
  }

  async function analyse(blob: Blob) {
    try {
      setStatus("Transcribing with ElevenLabs…");
      const form = new FormData();
      form.append("audio", blob, "answer.webm");
      const stt = await fetch("/api/transcribe", { method: "POST", body: form });
      const sttPayload = await stt.json();
      if (!stt.ok) throw new Error(sttPayload.error || "Transcription failed");
      setTranscript(sttPayload.text);

      const durationSeconds = startedAt ? Math.round((Date.now() - startedAt) / 1000) : undefined;
      setStatus("OpenAI is scoring your executive answer…");
      const coaching = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ persona, question, transcript: sttPayload.text, durationSeconds })
      });
      const coachingPayload = await coaching.json();
      if (!coaching.ok) throw new Error(coachingPayload.error || "Coaching failed");
      setResult(coachingPayload);
      setStatus("Coach ready");
      await speak(`${coachingPayload.coaching} Here is a stronger version. ${coachingPayload.executiveRewrite}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Something went wrong");
    }
  }

  async function speak(text: string) {
    const response = await fetch("/api/speak", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text })
    });
    if (!response.ok) return;
    const audio = new Audio(URL.createObjectURL(await response.blob()));
    await audio.play();
  }

  function nextQuestion() {
    setQuestionIndex((i) => (i + 1) % questions.length);
    setTranscript("");
    setResult(null);
    setStatus("Ready");
  }

  return (
    <main>
      <header className="topbar">
        <div className="brandMark">GT</div>
        <div>
          <h1>Gym Talk <span>for C-Level</span></h1>
          <p>Train the answer. Measure the improvement.</p>
        </div>
        <div className="status"><i className={recording ? "live" : ""} />{status}</div>
      </header>

      <section className="hero">
        <div>
          <div className="eyebrow">EXECUTIVE COMMUNICATION GYM</div>
          <h2>Speak less.<br/>Say more.</h2>
          <p className="lead">ElevenLabs listens and speaks. OpenAI evaluates how effectively you communicate with senior executives.</p>
        </div>
        <div className="scoreOrb">
          <span>{result ? Math.round(result.overallScore) : "—"}</span>
          <small>EXECUTIVE SCORE</small>
        </div>
      </section>

      <section className="grid">
        <div className="panel sessionPanel">
          <div className="panelTitle">01 / Choose the room</div>
          <div className="personas">
            {personas.map((p) => <button key={p} className={p === persona ? "active" : ""} onClick={() => changePersona(p)}>{p}</button>)}
          </div>

          <div className="questionBlock">
            <span>{persona.toUpperCase()} QUESTION</span>
            <h3>{question}</h3>
          </div>

          <button className={`record ${recording ? "recording" : ""}`} onClick={recording ? stopRecording : startRecording}>
            <span className="mic">{recording ? "■" : "●"}</span>
            {recording ? "Finish answer" : "Answer aloud"}
          </button>
          <p className="hint">Aim for 30–60 seconds. Lead with your answer, not your background.</p>
        </div>

        <div className="panel feedbackPanel">
          <div className="panelTitle">02 / Coach review</div>
          {!result ? (
            <div className="empty"><div>VOICE → REASONING → COACHING</div><p>Your scorecard appears after your first answer.</p></div>
          ) : (
            <>
              <div className="scoreGrid">
                {scoreRows.map(([label, score]) => <div className="scoreLine" key={label}><span>{label}</span><b>{Math.round(score)}</b><div><i style={{ width: `${score}%` }} /></div></div>)}
              </div>
              <div className="feedbackCopy"><strong>Keep</strong><p>{result.strongestPoint}</p><strong>Fix next</strong><p>{result.biggestImprovement}</p></div>
            </>
          )}
        </div>
      </section>

      {(transcript || result) && <section className="review">
        <article><span>YOUR ANSWER</span><p>{transcript}</p></article>
        {result && <>
          <article className="coach"><span>COACHING</span><p>{result.coaching}</p></article>
          <article className="rewrite"><span>EXECUTIVE VERSION</span><p>“{result.executiveRewrite}”</p><button onClick={() => speak(result.executiveRewrite)}>▶ Hear delivery</button></article>
          <article><span>NEXT PRESSURE TEST</span><p>{result.followUpQuestion}</p></article>
          <div className="actions"><button onClick={startRecording}>Repeat answer</button><button onClick={nextQuestion}>Next question →</button></div>
        </>}
      </section>}

      <footer>Option B architecture · ElevenLabs STT/TTS · OpenAI reasoning · API keys remain server-side</footer>
    </main>
  );
}
