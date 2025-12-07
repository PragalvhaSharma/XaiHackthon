export interface CandidateInput {
  name: string;
  email: string;
  linkedin?: string;
  x?: string;
  github?: string;
  role?: string;
  jobId?: string;
  jobTitle?: string;
  company?: string;
  resumeName?: string;
}

export interface ResearchData {
  x?: string;
  github?: string;
  linkedin?: string;
  additionalLinks?: string;
}

export interface ResearchResult {
  candidate: CandidateInput;
  researchNotes: string;
  rawResearch: ResearchData;
  sources: {
    linkedin?: string;
    x?: string;
    github?: string;
    warnings: string[];
  };
}

export type ResearchStepType = "start" | "x" | "github" | "linkedin" | "synthesis" | "complete" | "error";
export type ResearchStatus = "searching" | "done" | "error";

export type ResearchStep =
  | { type: "start"; message: string }
  | { type: "x" | "github" | "linkedin" | "synthesis"; status: ResearchStatus; message: string; data?: string }
  | { type: "complete"; result: ResearchResult }
  | { type: "error"; message: string };
