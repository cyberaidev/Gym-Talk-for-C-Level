import { z } from "zod";
import { PERSONAS } from "./types";
import { LIMITS } from "./limits";
import { ApiError } from "./errors";

const text = (max: number) => z.string().trim().min(1).max(max);
export const coachInput = z.object({
  persona: z.enum(PERSONAS), question: text(LIMITS.questionCharacters), transcript: text(LIMITS.transcriptCharacters),
  durationSeconds: z.number().finite().min(0.1).max(LIMITS.recordingSeconds + 1)
}).strict();
export const speechInput = z.object({ text: text(LIMITS.speechCharacters) }).strict();
const score = z.number().finite().min(0).max(100);
export const coachResult = z.object({
  overallScore: score,
  scores: z.object({ answerFirst: score, clarity: score, conciseness: score, businessImpact: score, evidence: score, executivePresence: score }).strict(),
  strongestPoint: text(2000), biggestImprovement: text(2000), coaching: text(1800), executiveRewrite: text(1800),
  followUpQuestion: text(LIMITS.questionCharacters), deliveryNotes: z.array(text(500)).min(1).max(4)
}).strict();

export function validate<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new ApiError(400, "The request contains invalid or oversized fields.");
  return result.data;
}
