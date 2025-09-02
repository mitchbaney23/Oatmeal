import { describe, it, expect } from 'vitest';
import { validateSummary, parseSummaryResponse } from './summary';

describe('Summary JSON validation', () => {
  it('validates a complete summary object', () => {
    const validSummary = {
      meeting_meta: { title: 'Test Meeting', attendees: ['S1', 'S2'], date: '2024-01-01', duration_minutes: 30 },
      company: { name: 'Acme Corp', industry: 'Software', size: '100-500' },
      pain_points: ['Slow deployments'],
      drivers: ['Efficiency'],
      decision_criteria: ['Security'],
      timeline: { event: 'Pilot', date: 'Q4' },
      budget: { mentioned: true, notes: 'TBD' },
      stakeholders: [{ name: 'John', role: 'CTO', influence: 'high' }],
      summary_bullets: ['Key point 1'],
      risks: ['Security review pending'],
      todos: [{ owner: 'S1', due: 'next week', text: 'Send proposal' }],
      crm_update: { stage: 'Evaluation', next_step: 'Security review', confidence: 'medium' },
      notes: 'Good call'
    };

    expect(() => validateSummary(validSummary)).not.toThrow();
  });

  it('parses JSON from LLM response', () => {
    const response = `\`\`\`json
{
  "meeting_meta": {"title": "Test", "attendees": [], "date": "", "duration_minutes": 0},
  "company": {"name": "", "industry": "", "size": ""},
  "pain_points": [],
  "drivers": [],
  "decision_criteria": [],
  "timeline": {"event": "", "date": ""},
  "budget": {"mentioned": false, "notes": ""},
  "stakeholders": [],
  "summary_bullets": [],
  "risks": [],
  "todos": [],
  "crm_update": {"stage": "", "next_step": "", "confidence": ""},
  "notes": ""
}
\`\`\``;

    expect(() => parseSummaryResponse(response)).not.toThrow();
  });
});