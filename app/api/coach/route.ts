import OpenAI from "openai";
import { NextResponse } from "next/server";
import { coachInstructions } from "../../../lib/prompts";
import type { Persona } from "../../../lib/types";

export const runtime = "nodejs";

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
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "OPENAI_API_KEY is not configured" }, { status: 500 });
  }

  const { persona, question, transcript, durationSeconds } = await request.json() as {
    persona: Persona;
    question: string;
    transcript: string;
    durationSeconds?: number;
  };

  if (!persona || !question || !transcript) {
    return NextResponse.json({ error: "persona, question and transcript are required" }, { status: 400 });
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await client.responses.create({
    model: process.env.OPENAI_MODEL || "gpt-5",
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
  });

  try {
    return NextResponse.json(JSON.parse(response.output_text));
  } catch {
    return NextResponse.json({ error: "OpenAI returned an unexpected coaching payload" }, { status: 502 });
  }
}
