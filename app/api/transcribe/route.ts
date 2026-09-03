import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "ELEVENLABS_API_KEY is not configured" }, { status: 500 });

  const incoming = await request.formData();
  const audio = incoming.get("audio");
  if (!(audio instanceof File)) return NextResponse.json({ error: "audio file is required" }, { status: 400 });

  const form = new FormData();
  form.append("file", audio, audio.name || "answer.webm");
  form.append("model_id", process.env.ELEVENLABS_STT_MODEL || "scribe_v2");
  form.append("language_code", "en");
  form.append("tag_audio_events", "true");
  form.append("timestamps_granularity", "word");

  const response = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: { "xi-api-key": apiKey },
    body: form
  });

  if (!response.ok) {
    return NextResponse.json({ error: `ElevenLabs STT failed: ${await response.text()}` }, { status: response.status });
  }

  const result = await response.json();
  return NextResponse.json({ text: result.text ?? "", words: result.words ?? [] });
}
