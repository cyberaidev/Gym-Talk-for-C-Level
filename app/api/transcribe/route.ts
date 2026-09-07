import { readBody, readBytes, runApi } from "../../../lib/api";
import { ApiError, checkProvider, requireProvider } from "../../../lib/errors";
import { LIMITS } from "../../../lib/limits";

export const runtime = "nodejs";
export const maxDuration = 70;
const audioTypes = new Set(["audio/webm", "video/webm", "audio/mp4", "audio/ogg", "audio/wav", "audio/x-wav"]);

export async function POST(request: Request) {
  return runApi(request, async signal => {
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.toLowerCase().startsWith("multipart/form-data;")) throw new ApiError(415, "Send an audio upload.");
    const bytes = await readBody(request, LIMITS.multipartBytes, signal);
    let incoming: FormData;
    try { incoming = await new Response(bytes, { headers: { "Content-Type": contentType } }).formData(); }
    catch { throw new ApiError(400, "The audio upload is malformed."); }
    const audio = incoming.get("audio");
    if (!(audio instanceof File) || !audio.size) throw new ApiError(400, "Record an answer before submitting it.");
    if (audio.size > LIMITS.audioBytes) throw new ApiError(413, "The recording is too large. Please use a shorter answer.");
    if (!audioTypes.has(audio.type.split(";")[0].toLowerCase())) throw new ApiError(415, "This audio format is not supported.");
    const form = new FormData();
    form.append("file", audio, audio.name);
    form.append("model_id", process.env.ELEVENLABS_STT_MODEL || "scribe_v2");
    form.append("language_code", "en");
    form.append("tag_audio_events", "true");
    form.append("timestamps_granularity", "word");
    const response = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
      method: "POST", headers: { "xi-api-key": requireProvider(process.env.ELEVENLABS_API_KEY) }, body: form, signal
    });
    checkProvider(response);
    const result = JSON.parse(new TextDecoder().decode(await readBytes(response.body, 2 * 1024 * 1024, signal)));
    if (typeof result.text !== "string") throw new ApiError(502, "The transcription service returned an invalid answer.");
    if (!result.text.trim()) throw new ApiError(422, "No speech was detected. Please try recording again.");
    if (result.text.length > LIMITS.transcriptCharacters) throw new ApiError(413, "The answer is too long. Please record a shorter version.");
    return Response.json({ text: result.text.trim() });
  });
}
