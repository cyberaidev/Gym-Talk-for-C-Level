import type { CoachResult } from "../lib/types";

export const feedback: CoachResult = {
  overallScore: 90,
  scores: { answerFirst: 70, clarity: 80, conciseness: 70, businessImpact: 80, evidence: 60, executivePresence: 60 },
  strongestPoint: "Clear recommendation", biggestImprovement: "Provide supporting evidence",
  coaching: "Explain how you will measure the pilot.", executiveRewrite: "Approve a pilot, with success criteria agreed before we begin.",
  followUpQuestion: "Which assumption would invalidate your business case?", deliveryNotes: ["Practise pausing after the recommendation."]
};

export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}
