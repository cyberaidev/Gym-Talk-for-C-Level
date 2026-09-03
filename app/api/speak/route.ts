import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;
  if (!apiKey || !voiceId) {
    return NextResponse.json({ error: "ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID are required" }, { status: 500 });
  }

  const { text } = await request.json();
  if (!text || typeof text !== "string") return NextResponse.json({ error: "text is required" }, { status: 400 });

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        text,
        model_id: process.env.ELEVENLABS_TTS_MODEL || "eleven_flash_v2_5",
        voice_settings: { stability: 0.45, similarity_boost: 0.75, speed: 0.96 }
      })
    }
  );

  if (!response.ok) {
    return NextResponse.json({ error: `ElevenLabs TTS failed: ${await response.text()}` }, { status: response.status });
  }

  return new Response(await response.arrayBuffer(), {
    headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" }
  });
}
