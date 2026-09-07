"use client";

import { usePractice } from "../lib/use-practice";
import { PERSONAS } from "../lib/types";

export default function Home() {
  const { persona, question, phase, status, transcript, result, retryAudio, canRetry, busy,
    startRecording, stopRecording, changePersona, nextQuestion, followUp, cancel, speak, retryAnalysis } = usePractice();
  const recording = phase === "recording";
  const scoreRows = result ? [
    ["Answer first", result.scores.answerFirst], ["Clarity", result.scores.clarity],
    ["Conciseness", result.scores.conciseness], ["Business impact", result.scores.businessImpact],
    ["Evidence", result.scores.evidence], ["Executive presence", result.scores.executivePresence]
  ] as const : [];

  return (
    <main>
      <header className="topbar">
        <div className="brandMark">GT</div>
        <div>
          <h1>Gym Talk <span>for C-Level</span></h1>
          <p>Train the answer. Measure the improvement.</p>
        </div>
        <div className="status" role="status" aria-live="polite"><i className={recording ? "live" : ""} />{status}</div>
      </header>

      <section className="hero">
        <div>
          <div className="eyebrow">EXECUTIVE COMMUNICATION GYM</div>
          <h2>Speak less.<br/>Say more.</h2>
          <p className="lead">Practise clear, credible answers for senior executives. Get focused feedback and a stronger version to rehearse.</p>
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
            {PERSONAS.map((p) => <button key={p} className={p === persona ? "active" : ""} aria-pressed={p === persona} disabled={busy} onClick={() => changePersona(p)}>{p}</button>)}
          </div>

          <div className="questionBlock">
            <span>{persona.toUpperCase()} QUESTION</span>
            <h3>{question}</h3>
          </div>

          <button className={`record ${recording ? "recording" : ""}`} disabled={busy && !recording} onClick={recording ? stopRecording : startRecording}>
            <span className="mic">{recording ? "■" : "●"}</span>
            {recording ? "Finish answer" : "Answer aloud"}
          </button>
          {busy && <button className="secondary" onClick={cancel}>Cancel</button>}
          {canRetry && <button className="secondary" onClick={retryAnalysis}>Retry analysis</button>}
          <p className="hint">Aim for 30–60 seconds. Lead with your answer, not your background. Recording stops after two minutes.</p>
          <p className="hint">Your recording is sent to ElevenLabs; its transcript is sent to OpenAI for coaching. This app keeps no session history. Provider retention settings apply.</p>
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
              <div className="feedbackCopy"><p className="hint">Executive presence reflects wording and structure; vocal delivery is not assessed.</p><strong>Keep</strong><p>{result.strongestPoint}</p><strong>Fix next</strong><p>{result.biggestImprovement}</p></div>
            </>
          )}
        </div>
      </section>

      {(transcript || result) && <section className="review">
        <article><span>YOUR ANSWER</span><p>{transcript}</p></article>
        {result && <>
          <article className="coach"><span>COACHING</span><p>{result.coaching}</p></article>
          <article className="rewrite"><span>EXECUTIVE VERSION</span><p>“{result.executiveRewrite}”</p><button disabled={busy} onClick={() => speak(result.executiveRewrite)}>▶ Hear delivery</button></article>
          <article><span>NEXT PRESSURE TEST</span><p>{result.followUpQuestion}</p></article>
          <div className="actions"><button disabled={busy} onClick={startRecording}>Repeat answer</button><button disabled={busy} onClick={followUp}>Answer follow-up</button><button disabled={busy} onClick={nextQuestion}>Next question →</button></div>
        </>}
      </section>}

      {retryAudio && <button className="secondary" disabled={busy} onClick={() => speak(retryAudio)}>Retry audio</button>}
      {phase === "speaking" && <button className="secondary" onClick={cancel}>Stop audio</button>}
      <footer>Practise with purpose. Lead with a clear answer.</footer>
    </main>
  );
}
