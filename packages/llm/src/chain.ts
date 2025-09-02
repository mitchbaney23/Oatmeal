import { ClaudeProvider } from './providers/claude';
import { OpenAIProvider } from './providers/openai';
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

  constructor(config: { anthropicKey?: string; openaiKey?: string }) {
    if (config.anthropicKey) {
      this.claude = new ClaudeProvider({ apiKey: config.anthropicKey });
    }
    if (config.openaiKey) {
      this.openai = new OpenAIProvider({ apiKey: config.openaiKey });
    }
  }

  async runSummaryPipeline(
    transcript: string,
    meta: PipelineMeta = {},
    templates: { markdown?: string; email?: string } = {},
    userProfile?: any
  ): Promise<PipelineResult> {
    const startTime = Date.now();

    // Generate summary
    const summaryResult = await this.generateSummary(transcript);
    
    // Generate learning analysis if user profile provided
    let learning: LearningAnalysis | undefined;
    if (userProfile && this.claude) {
      try {
        learning = await this.claude.generateLearningAnalysis(transcript, userProfile);
      } catch (error) {
        console.warn('Learning analysis failed:', error);
      }
    }

    const markdown = this.renderMarkdown(summaryResult.summary, templates.markdown);
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

  private async generateSummary(transcript: string): Promise<{
    summary: MeetingSummary;
    tokens: number;
  }> {
    if (this.claude) {
      const result = await this.claude.generateSummary(transcript);
      return { summary: result.summary, tokens: result.tokens };
    }
    
    if (this.openai) {
      const result = await this.openai.generateSummary(transcript);
      return { summary: result.summary, tokens: result.tokens };
    }

    throw new Error('No LLM provider configured');
  }

  private renderMarkdown(summary: MeetingSummary, template?: string): string {
    if (template) {
      // Would use template engine here
      return template;
    }

    return `# ${summary.meeting_meta.title}

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