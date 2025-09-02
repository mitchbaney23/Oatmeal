import { z } from 'zod';

export const learningAnalysisSchema = z.object({
  meeting_meta: z.object({
    title: z.string(),
    date: z.string(),
    duration_minutes: z.number()
  }),
  meddpicc: z.object({
    metrics: z.array(z.string()),
    economic_buyer: z.string(),
    decision_criteria: z.array(z.string()),
    decision_process: z.array(z.string()),
    paper_process: z.array(z.string()),
    implication_of_pain: z.array(z.string()),
    champion: z.string(),
    competition: z.array(z.string()),
    gaps: z.array(z.string())
  }),
  learning: z.object({
    moments: z.array(z.object({
      timestamp: z.string(),
      quote: z.string(),
      tag: z.enum(['good_question', 'missed_opportunity', 'objection', 'storytelling', 'next_step']),
      why_it_matters: z.string()
    })),
    questions_for_next_time: z.array(z.string()),
    micro_lessons: z.array(z.object({
      title: z.string(),
      tip: z.string(),
      confidence: z.enum(['low', 'medium', 'high'])
    })),
    skill_scores: z.object({
      discovery: z.number().min(0).max(5),
      objection_handling: z.number().min(0).max(5),
      closing: z.number().min(0).max(5),
      listening: z.number().min(0).max(5),
      exec_presence: z.number().min(0).max(5)
    }),
    coaching_notes: z.string()
  }),
  next_steps: z.array(z.object({
    owner: z.string(),
    due: z.string(),
    text: z.string()
  })),
  followups: z.array(z.object({
    type: z.enum(['email', 'doc', 'slack']),
    target: z.string(),
    summary: z.string()
  })),
  notes: z.string()
});

export type LearningAnalysis = z.infer<typeof learningAnalysisSchema>;

export const LEARNING_SYSTEM_PROMPT = `You are a sales call analyst and coach. Extract MEDDPICC, actionable next steps, and learning moments for this user. Do not invent facts. If unknown, leave empty. Output strict JSON following the schema.

Scoring Rubric (1-5):
- Discovery: 1=asks features; 3=clarifies pains & impact; 5=maps pains → metrics, EB, timeline
- Objection Handling: 1=deflects; 3=acknowledges + probes; 5=isolates, handles, confirms
- Closing: 1=no ask; 3=asks soft next step; 5=mutual close with date/owner
- Listening: 1=interrupts; 3=reflects; 5=mirrors, summarizes, validates
- Exec Presence: 1=rambling; 3=concise; 5=structured, confident, time-aware`;

export function validateLearningAnalysis(data: unknown): LearningAnalysis {
  return learningAnalysisSchema.parse(data);
}

export function parseLearningResponse(response: string): LearningAnalysis {
  try {
    const cleaned = response.replace(/```json\n?|```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return validateLearningAnalysis(parsed);
  } catch (error) {
    throw new Error(`Failed to parse learning response: ${error}`);
  }
}