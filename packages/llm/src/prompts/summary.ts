import { z } from 'zod';

export const meetingSummarySchema = z.object({
  meeting_meta: z.object({
    title: z.string(),
    attendees: z.array(z.string()),
    date: z.string(),
    duration_minutes: z.number()
  }),
  company: z.object({
    name: z.string(),
    industry: z.string(),
    size: z.string()
  }),
  pain_points: z.array(z.string()),
  drivers: z.array(z.string()),
  decision_criteria: z.array(z.string()),
  timeline: z.object({
    event: z.string(),
    date: z.string()
  }),
  budget: z.object({
    mentioned: z.boolean(),
    notes: z.string()
  }),
  stakeholders: z.array(z.object({
    name: z.string(),
    role: z.string(),
    influence: z.string()
  })),
  summary_bullets: z.array(z.string()),
  risks: z.array(z.string()),
  todos: z.array(z.object({
    owner: z.string(),
    due: z.string(),
    text: z.string()
  })),
  crm_update: z.object({
    stage: z.string(),
    next_step: z.string(),
    confidence: z.string()
  }),
  notes: z.string()
});

export type MeetingSummary = z.infer<typeof meetingSummarySchema>;

export const SUMMARY_SYSTEM_PROMPT = `You transform messy transcripts into a strict JSON object for sales meetings. Follow the JSON Schema exactly. If a field is unknown, use an empty string or empty array—never hallucinate. Extract explicit commitments and dates; infer reasonable next step only if strongly implied and mark \`inferred: true\` in a note. Return **only** JSON.`;

export function validateSummary(data: unknown): MeetingSummary {
  return meetingSummarySchema.parse(data);
}

export function parseSummaryResponse(response: string): MeetingSummary {
  try {
    const cleaned = response.replace(/```json\n?|```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return validateSummary(parsed);
  } catch (error) {
    throw new Error(`Failed to parse summary response: ${error}`);
  }
}