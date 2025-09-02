import OpenAI from 'openai';
import { MeetingSummary, SUMMARY_SYSTEM_PROMPT, parseSummaryResponse } from '../prompts/summary';

export interface OpenAIConfig {
  apiKey: string;
  model?: string;
  maxTokens?: number;
}

export class OpenAIProvider {
  private client: OpenAI;
  private model: string;
  private maxTokens: number;

  constructor(config: OpenAIConfig) {
    this.client = new OpenAI({ apiKey: config.apiKey });
    this.model = config.model || 'gpt-4';
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
        const response = await this.client.chat.completions.create({
          model: this.model,
          messages: [
            { role: 'system', content: SUMMARY_SYSTEM_PROMPT },
            { role: 'user', content: transcript }
          ],
          max_tokens: this.maxTokens,
          temperature: 0.1
        });

        const content = response.choices[0]?.message?.content;
        if (!content) {
          throw new Error('No content in OpenAI response');
        }

        const summary = parseSummaryResponse(content);
        const latencyMs = Date.now() - startTime;
        const tokens = response.usage?.total_tokens || 0;

        return { summary, tokens, latencyMs };
      } catch (error) {
        console.error(`OpenAI API attempt ${attempt + 1} failed:`, error);
        
        if (attempt === retries) {
          throw new Error(`OpenAI API failed after ${retries + 1} attempts: ${error}`);
        }
        
        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
      }
    }

    throw new Error('All retries exhausted');
  }
}