import OpenAI from "openai";
import { coachInstructions } from "../../../lib/prompts";
import { readJson, runApi } from "../../../lib/api";
import { ApiError, requireProvider } from "../../../lib/errors";
import { coachInput, coachResult, validate } from "../../../lib/validation";

export const runtime = "nodejs";
export const maxDuration = 70;

const schema = {
  type: "object",
  additionalProperties: false,
  properties: {
    overallScore: { type: "number", minimum: 0, maximum: 100 },
    scores: {
      type: "object",
      additionalProperties: false,
      properties: {
        answerFirst: { type: "number", minimum: 0, maximum: 100 },
        clarity: { type: "number", minimum: 0, maximum: 100 },
        conciseness: { type: "number", minimum: 0, maximum: 100 },
        businessImpact: { type: "number", minimum: 0, maximum: 100 },
        evidence: { type: "number", minimum: 0, maximum: 100 },
        executivePresence: { type: "number", minimum: 0, maximum: 100 }
      },
      required: ["answerFirst", "clarity", "conciseness", "businessImpact", "evidence", "executivePresence"]
    },
    strongestPoint: { type: "string" },
    biggestImprovement: { type: "string" },
    coaching: { type: "string" },
    executiveRewrite: { type: "string" },
    followUpQuestion: { type: "string" },
    deliveryNotes: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 4 }
  },
  required: ["overallScore", "scores", "strongestPoint", "biggestImprovement", "coaching", "executiveRewrite", "followUpQuestion", "deliveryNotes"]
};

export async function POST(request: Request) {
  return runApi(request, async signal => {
    const { persona, question, transcript, durationSeconds } = validate(coachInput, await readJson(request, signal));
    const client = new OpenAI({ apiKey: requireProvider(process.env.OPENAI_API_KEY), timeout: 55_000, maxRetries: 0 });
    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-5",
      store: false,
      max_output_tokens: 5000,
      instructions: coachInstructions(persona),
      input: `EXECUTIVE QUESTION:\n${question}\n\nSPOKEN ANSWER:\n${transcript}\n\nApproximate answer duration: ${durationSeconds ?? "unknown"} seconds.`,
      text: {
        format: {
          type: "json_schema",
          name: "executive_coaching_result",
          strict: true,
          schema
        }
      }
    }, { signal }).catch(error => {
      if (signal.aborted) throw signal.reason;
      if (error instanceof OpenAI.APIError && error.status === 429) throw new ApiError(429, "The coach is busy. Please try again shortly.", 30);
      if (error instanceof OpenAI.APIConnectionTimeoutError) throw new ApiError(504, "The coach timed out. Please try again.");
      throw new ApiError(502, "The coach is unavailable. Please try again.");
    });
    if (response.output.some(item => item.type === "message" && item.content.some(part => part.type === "refusal"))) {
      throw new ApiError(422, "The coach could not evaluate this answer. Please rephrase it.");
    }
    if (response.status !== "completed") throw new ApiError(502, "The coach could not finish this answer. Please try again.");
    let value: unknown;
    try { value = JSON.parse(response.output_text); }
    catch { throw new ApiError(502, "The coach returned an incomplete scorecard. Please try again."); }
    const parsed = coachResult.safeParse(value);
    if (!parsed.success) throw new ApiError(502, "The coach returned an invalid scorecard. Please try again.");
    const data = parsed.data;
    data.overallScore = Math.round(Object.values(data.scores).reduce((sum, score) => sum + score, 0) / 6);
    return Response.json(data);
  });
}
