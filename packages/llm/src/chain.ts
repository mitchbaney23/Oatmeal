// Lazy-load cloud providers to keep browser bundles slim and avoid Node-only deps
type ClaudeProvider = any;
type OpenAIProvider = any;
import { OllamaProvider } from './providers/ollama';
import { MeetingSummary } from './prompts/summary';
import { LearningAnalysis } from './prompts/learning';

export interface PipelineResult {
  summary: MeetingSummary;
  learning?: LearningAnalysis;
  markdown: string;
  email: { subject: string; body: string };
  telemetry: {
    tokens: number;
    latency_ms: number;
    model: string;
    provider: 'anthropic' | 'openai';
  };
}

export interface PipelineMeta {
  title?: string;
  attendees?: string[];
  date?: string;
}

export class SummaryPipeline {
  private claude?: ClaudeProvider;
  private openai?: OpenAIProvider;
  private ollama?: OllamaProvider;

  constructor(private config: { anthropicKey?: string; openaiKey?: string; ollama?: { host?: string; model?: string; enabled?: boolean } }) {
    // Ollama is always safe to init in browser
    if (config.ollama?.enabled && config.ollama.model) {
      this.ollama = new OllamaProvider({ host: config.ollama.host, model: config.ollama.model });
    }
  }

  private async ensureClaude() {
    if (!this.claude && this.config.anthropicKey) {
      const mod = await import('./providers/claude');
      const Provider = mod.ClaudeProvider;
      this.claude = new Provider({ apiKey: this.config.anthropicKey });
    }
  }

  private async ensureOpenAI() {
    if (!this.openai && this.config.openaiKey) {
      const mod = await import('./providers/openai');
      const Provider = mod.OpenAIProvider;
      this.openai = new Provider({ apiKey: this.config.openaiKey });
    }
  }

  async runSummaryPipeline(
    transcript: string,
    meta: PipelineMeta = {},
    templates: { markdown?: string; email?: string } = {},
    userProfile?: any
  ): Promise<PipelineResult> {
    const startTime = Date.now();
    const isSales = this.detectSalesContext(transcript);

    // Generate summary
    const summaryResult = await this.generateSummary(transcript, isSales ? 'sales' : 'general');
    
    // Generate learning analysis if user profile provided
    let learning: LearningAnalysis | undefined;
    if (userProfile && this.claude) {
      try {
        learning = await this.claude.generateLearningAnalysis(transcript, userProfile);
      } catch (error) {
        console.warn('Learning analysis failed:', error);
      }
    }

    const markdown = this.renderMarkdown(summaryResult.summary, templates.markdown, isSales ? 'sales' : 'general');
    const email = this.renderEmail(summaryResult.summary, templates.email);

    return {
      summary: summaryResult.summary,
      learning,
      markdown,
      email,
      telemetry: {
        tokens: summaryResult.tokens,
        latency_ms: Date.now() - startTime,
        model: 'claude-3-5-sonnet',
        provider: 'anthropic'
      }
    };
  }

  private buildPrompt(transcript: string, meta: PipelineMeta): string {
    const metaStr = meta.title ? `Meeting: ${meta.title}\n` : '';
    const attendeesStr = meta.attendees?.length ? `Attendees: ${meta.attendees.join(', ')}\n` : '';
    
    return `${metaStr}${attendeesStr}\nTranscript:\n${transcript}`;
  }

  private async generateSummary(transcript: string, mode: 'sales' | 'general'): Promise<{
    summary: MeetingSummary;
    tokens: number;
  }> {
    // Prefer local Ollama if configured
    if (this.ollama) {
      const result = await this.ollama.generateSummary(transcript, mode);
      // Result summary may not match our schema exactly; normalize minimal fields
      const normalized = {
        meeting_meta: { title: '', attendees: [], date: '', duration_minutes: 0 },
        company: { name: '', industry: '', size: '' },
        pain_points: result.summary.pain_points || [],
        drivers: result.summary.drivers || [],
        decision_criteria: result.summary.decision_criteria || [],
        timeline: result.summary.timeline || { event: '', date: '' },
        budget: result.summary.budget || { mentioned: false, notes: '' },
        stakeholders: result.summary.stakeholders || [],
        summary_bullets: result.summary.summary_bullets || [],
        risks: result.summary.risks || [],
        todos: result.summary.todos || [],
        crm_update: result.summary.crm_update || { stage: '', next_step: '', confidence: '' },
        notes: result.summary.executive_summary || ''
      } as MeetingSummary;
      return { summary: normalized, tokens: result.tokens };
    }

    if (this.config.anthropicKey) {
      await this.ensureClaude();
      const result = await this.claude!.generateSummary(transcript);
      return { summary: result.summary, tokens: result.tokens };
    }
    
    if (this.config.openaiKey) {
      await this.ensureOpenAI();
      const result = await this.openai!.generateSummary(transcript);
      return { summary: result.summary, tokens: result.tokens };
    }

    throw new Error('No LLM provider configured');
  }

  private detectSalesContext(text: string): boolean {
    const t = text.toLowerCase();
    const salesTerms = [
      'budget', 'pricing', 'quote', 'contract', 'procurement', 'purchase', 'invoice', 'pilot', 'poc', 'proof of concept',
      'decision maker', 'stakeholder', 'champion', 'timeline', 'close date', 'next step', 'kedp', 'meddpicc', 'crm',
      'salesforce', 'pipeline', 'forecast', 'deal', 'renewal', 'arr', 'mrr'
    ];
    let hits = 0;
    for (const term of salesTerms) if (t.includes(term)) hits++;
    return hits >= 3; // basic heuristic
  }

  private renderMarkdown(summary: MeetingSummary, template?: string, mode: 'sales' | 'general' = 'general'): string {
    if (template) {
      // Would use template engine here
      return template;
    }

    if (mode === 'sales') {
      return `# ${summary.meeting_meta.title || 'Meeting Summary'}

**Attendees:** ${summary.meeting_meta.attendees.join(', ')}

## Key Points
${summary.summary_bullets.map(bullet => `- ${bullet}`).join('\n')}

## Pain Points
${summary.pain_points.map(pain => `- ${pain}`).join('\n')}

## Decision Criteria
${summary.decision_criteria.map(criteria => `- ${criteria}`).join('\n')}

## Risks
${summary.risks.map(risk => `- ${risk}`).join('\n')}

## Next Steps
${summary.todos.map(todo => `- ${todo.text} (${todo.owner}, ${todo.due})`).join('\n')}

**CRM Update:** ${summary.crm_update.next_step}`;
    }

    // General non-sales summary layout
    return `# Meeting Summary

## Executive Summary
${summary.notes || ''}

## Key Points
${(summary as any).summary_bullets?.map((b: string) => `- ${b}`).join('\n') || ''}

## Decisions
${(summary as any).decisions?.map((d: string) => `- ${d}`).join('\n') || ''}

## Action Items
${summary.todos?.map(todo => `- ${todo.text || ''}`).join('\n') || ''}

## Risks
${summary.risks?.map(risk => `- ${risk}`).join('\n') || ''}`;
  }

  private renderEmail(summary: MeetingSummary, template?: string): { subject: string; body: string } {
    if (template) {
      // Would use template engine here
      return { subject: '', body: template };
    }

    const stakeholderName = summary.stakeholders[0]?.name || 'team';
    
    return {
      subject: `Recap + next step for ${summary.company.name}`,
      body: `Hi ${stakeholderName},

Thanks for the call. Highlights:
${summary.summary_bullets.map(bullet => `- ${bullet}`).join('\n')}

Next step: ${summary.crm_update.next_step}.

Best regards`
    };
  }
}
