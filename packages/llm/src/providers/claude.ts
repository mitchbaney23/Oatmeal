import Anthropic from '@anthropic-ai/sdk';
import { MeetingSummary, SUMMARY_SYSTEM_PROMPT, parseSummaryResponse } from '../prompts/summary';

export interface ClaudeConfig {
  apiKey: string;
  model?: string;
  maxTokens?: number;
}

export class ClaudeProvider {
  private client: Anthropic;
  private model: string;
  private maxTokens: number;

  constructor(config: ClaudeConfig) {
    this.client = new Anthropic({ apiKey: config.apiKey });
    this.model = config.model || 'claude-3-5-sonnet-20241022';
    this.maxTokens = config.maxTokens || 4000;
  }

  async generateSummary(transcript: string, retries = 2): Promise<{
    summary: MeetingSummary;
    tokens: number;
    latencyMs: number;
  }> {
    const startTime = Date.now();

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await this.client.messages.create({
          model: this.model,
          max_tokens: this.maxTokens,
          system: SUMMARY_SYSTEM_PROMPT,
          messages: [{ role: 'user', content: transcript }]
        });

        const content = response.content[0];
        if (content.type !== 'text') {
          throw new Error('Unexpected response type from Claude');
        }

        const summary = parseSummaryResponse(content.text);
        const latencyMs = Date.now() - startTime;
        const tokens = (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0);

        return { summary, tokens, latencyMs };
      } catch (error) {
        console.error(`Claude API attempt ${attempt + 1} failed:`, error);
        
        if (attempt === retries) {
          throw new Error(`Claude API failed after ${retries + 1} attempts: ${error}`);
        }
        
        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
      }
    }

    throw new Error('All retries exhausted');
  }

  async generateLearningAnalysis(transcript: string, userProfile: any): Promise<any> {
    const learningPrompt = `You are a sales call analyst and coach for ${userProfile.name} (${userProfile.role}). Extract MEDDPICC, actionable next steps, and learning moments for this user. Return only JSON following the learning schema.`;

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        system: learningPrompt,
        messages: [{ role: 'user', content: transcript }]
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type from Claude');
      }

      return JSON.parse(content.text);
    } catch (error) {
      throw new Error(`Learning analysis failed: ${error}`);
    }
  }
}