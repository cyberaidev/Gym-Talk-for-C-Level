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
npm ci
npm run dev
```

Use Node.js 22.12 or newer. Before starting, set the provider keys and `GT_ACCESS_PASSWORD` in `.env.local`. Generate a unique password with `openssl rand -hex 32`; the app requires at least 32 characters. Open `http://localhost:3000`, sign in as `coach` with that password, and allow microphone access. The app and all paid API routes reject requests when access protection is missing.

## Environment variables

```bash
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-5
ELEVENLABS_API_KEY=...
ELEVENLABS_VOICE_ID=...
ELEVENLABS_TTS_MODEL=eleven_flash_v2_5
ELEVENLABS_STT_MODEL=scribe_v2
GT_ACCESS_USERNAME=coach
GT_ACCESS_PASSWORD=<unique-random-password-at-least-32-characters>
UPSTASH_REDIS_REST_URL=<production-redis-rest-url>
UPSTASH_REDIS_REST_TOKEN=<production-redis-rest-token>
```

Use your own ElevenLabs voice ID. Do not commit `.env.local`.

## Production access and usage limits

Serve the app over HTTPS. Browser HTTP Basic authentication protects the app, and each API handler independently checks the same credential. This MVP uses one shared practice account; rotate its password to revoke access. It is not a multi-user identity system. Browser sign-in lasts until the browser clears its cached HTTP credentials.

Production requires both Upstash Redis REST variables. Provision a dedicated database and a token permitted to run EVAL, TIME, GET, INCR, EXPIRE, TTL, ZADD, ZCARD, ZREM, ZREMRANGEBYSCORE, and PEXPIRE. Atomic reservations limit the shared account across every instance to 30 paid API requests per rolling minute, 300 per 24-hour quota window, and three concurrent requests. A workout normally uses three requests. Failures and invalid authenticated requests count toward quotas. If Redis is unavailable or misconfigured, paid requests fail closed. Development alone can use an in-memory limiter, which resets when its process restarts.

Limits in `lib/limits.ts` also cap JSON bodies at 64 KiB, audio at 8 MiB, transcription text at 12,000 characters, and speech synthesis text at 4,000 characters. Recordings stop after two minutes in the browser; the server bounds encoded audio bytes and does not independently decode its duration. Configure your ingress request-body limit to match or be smaller than the application limit. Each API operation has a 60-second deadline, and provider calls have no automatic retries. Deployment functions must support at least 70 seconds. Pending concurrency reservations expire after 70 seconds if a worker exits.

Use **Cancel** to discard pending work, **Retry analysis** to resubmit a failed recording, and **Retry audio** when playback fails or the browser blocks autoplay. **Answer follow-up** selects the generated challenge; **Next question** advances the predefined exercises. Starting an answer stops coaching playback.

## Verification

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npm audit
```

GitHub Actions runs these checks. Regression tests mock microphone and provider interfaces, so they do not require API credentials or incur provider charges. The committed lockfile fixes the tested dependency tree; a PostCSS override keeps the Next.js 15 dependency patched.

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

- Keep provider and access credentials server-side only; HTTP Basic authentication requires HTTPS outside localhost.
- No recordings, transcripts, or scorecards are persisted by this app. A failed recording is kept in browser memory only for Retry analysis and is discarded when the user starts another exercise, cancels, or leaves the page.
- Audio is sent to ElevenLabs; transcripts are sent to OpenAI. The UI explains this before recording. OpenAI Responses requests use `store: false`; this does not disable provider abuse-monitoring retention. Review both providers' account-specific retention controls before handling confidential material.
- Shared quotas and payload limits protect provider access; Redis stores counters and random reservation IDs, not recordings or transcripts.
- Use separate named accounts or a managed identity provider before a multi-user rollout.
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
