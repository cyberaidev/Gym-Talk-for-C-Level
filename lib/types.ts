export type Persona = "CEO" | "CFO" | "CISO" | "CIO" | "Board Member" | "Sceptical Customer";

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
