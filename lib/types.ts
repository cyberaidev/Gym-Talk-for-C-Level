export const PERSONAS = ["CEO", "CFO", "CISO", "CIO", "Board Member", "Sceptical Customer"] as const;
export type Persona = typeof PERSONAS[number];

export type ScoreSet = {
  answerFirst: number;
  clarity: number;
  conciseness: number;
  businessImpact: number;
  evidence: number;
  executivePresence: number;
};

export type CoachResult = {
  overallScore: number;
  scores: ScoreSet;
  strongestPoint: string;
  biggestImprovement: string;
  coaching: string;
  executiveRewrite: string;
  followUpQuestion: string;
  deliveryNotes: string[];
};
