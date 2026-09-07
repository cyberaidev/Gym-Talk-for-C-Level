import { readBytes, readJson, runApi } from "../../../lib/api";
import { ApiError, checkProvider, requireProvider } from "../../../lib/errors";
import { speechInput, validate } from "../../../lib/validation";

export const runtime = "nodejs";
export const maxDuration = 70;

export async function POST(request: Request) {
  return runApi(request, async signal => {
    const { text } = validate(speechInput, await readJson(request, signal));
    const voiceId = requireProvider(process.env.ELEVENLABS_VOICE_ID);
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
      method: "POST", signal,
      headers: { "xi-api-key": requireProvider(process.env.ELEVENLABS_API_KEY), "Content-Type": "application/json" },
      body: JSON.stringify({ text, model_id: process.env.ELEVENLABS_TTS_MODEL || "eleven_flash_v2_5", voice_settings: { stability: 0.45, similarity_boost: 0.75, speed: 0.96 } })
    });
    checkProvider(response);
    const audio = await readBytes(response.body, 8 * 1024 * 1024, signal);
    if (!audio.length) throw new ApiError(502, "The speech service returned no audio. Please try again.");
    return new Response(audio, { headers: { "Content-Type": "audio/mpeg" } });
  });
}
