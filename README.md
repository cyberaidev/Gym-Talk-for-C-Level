# Gym Talk for C-Level

An AI executive-speaking gym that helps technology leaders practise concise, credible C-level communication.

**Architecture: Option B — ElevenLabs speech layer + OpenAI reasoning layer.**

## What the MVP does

1. Pick an executive persona: CEO, CFO, CISO, CIO, Board Member, or Sceptical Customer.
2. Answer a pressure-test question through your microphone.
3. ElevenLabs Scribe transcribes the answer.
4. OpenAI evaluates the answer with a structured executive-communication rubric.
5. The app scores Answer First, Clarity, Conciseness, Business Impact, Evidence, and Executive Presence.
6. OpenAI creates a stronger 30–60 second executive version and a follow-up challenge.
7. ElevenLabs speaks the coaching and improved answer back to you.
8. Repeat until the answer improves.

## Architecture

```text
Browser microphone
      |
      v
Next.js UI ------------------------------+
      |                                  |
      | recorded audio                   | coaching text
      v                                  v
/api/transcribe                      /api/speak
      |                                  |
      v                                  v
ElevenLabs Scribe STT                ElevenLabs TTS
      |
      | transcript
      v
/api/coach
      |
      v
OpenAI Responses API
      |
      +--> structured scorecard
      +--> coaching
      +--> executive rewrite
      +--> pressure-test follow-up
```

The API keys never need to be exposed to the browser.

## Why this split

ElevenLabs specialises in the speech experience. OpenAI owns the reasoning, executive persona simulation, structured evaluation, coaching, and future agent orchestration. The boundary is intentional: either layer can be upgraded independently.

This MVP uses batch Scribe STT and synchronous TTS because it is easy to deploy and debug. The next iteration can replace the turn-based voice loop with ElevenLabs Speech Engine/WebSocket streaming without changing the coaching domain model.

## Run locally

```bash
cp .env.example .env.local
npm install
npm run dev
```

Open `http://localhost:3000` and allow microphone access.

## Environment variables

```bash
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-5
ELEVENLABS_API_KEY=...
ELEVENLABS_VOICE_ID=...
ELEVENLABS_TTS_MODEL=eleven_flash_v2_5
ELEVENLABS_STT_MODEL=scribe_v2
```

Use your own ElevenLabs voice ID. Do not commit `.env.local`.

## Coaching model

The default coaching framework prioritises:

- **Answer first** — state the conclusion before background.
- **Impact** — translate technology into revenue, risk, cost, resilience, or strategic speed.
- **Evidence** — quantify where possible and distinguish facts from assumptions.
- **Action** — end with a decision, recommendation, or next step.
- **Executive presence** — confident and direct without overstating certainty.
- **Brevity** — default to a 30–60 second answer and expand only when invited.

## Recommended roadmap

### v0.2 — Training history
Persist sessions in Postgres/Supabase and show trend lines, common weaknesses, average answer duration, filler words, and score movement by persona.

### v0.3 — Live Speech Engine
Use ElevenLabs Speech Engine with WebSockets for natural turn-taking and interruption. The executive persona can cut in with questions such as “So what?” or “Give me the number.”

### v0.4 — Presentation rehearsal
Upload a slide deck and audience brief. Generate questions by slide, detect over-explaining, and score the spoken narrative against the deck's intended business outcome.

### v0.5 — Personal curriculum
Create a daily 10–15 minute workout automatically from the user's weakest dimensions. Add spaced repetition for difficult questions.

### v0.6 — Executive rooms
Multi-agent simulations: CEO + CFO + CISO, each with different objectives, followed by a consolidated debrief.

## Security notes

- Keep OpenAI and ElevenLabs API keys server-side only.
- Add authentication before storing recordings or transcripts.
- Make recording retention explicit and configurable.
- Avoid storing raw audio by default unless the user opts in.
- Add rate limiting before exposing the APIs publicly.
- For enterprise deployment, document provider retention controls and data-processing requirements.

## External training material

The product should learn communication frameworks for storytelling, openings, pacing, and narrative structure. Executive-conversation mode should optimise for brevity, evidence, decision relevance, and challenge handling. Any third-party training corpus should be reviewed for licensing before ingestion.

## Tech stack

- Next.js + TypeScript
- OpenAI Responses API
- ElevenLabs Speech-to-Text (Scribe)
- ElevenLabs Text-to-Speech
- Browser MediaRecorder API

## License

No license selected yet. Add one before accepting external contributions.
