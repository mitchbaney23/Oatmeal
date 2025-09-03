export interface OllamaConfig {
  host?: string; // e.g., http://127.0.0.1:11434
  model: string; // e.g., llama3.1:8b-instruct-q4_K_M
}

export interface SummaryVariant {
  id: string;
  approach: 'detailed' | 'concise' | 'action-focused';
  summary: any;
  tokens: number;
  latencyMs: number;
  temperature: number;
}

export class OllamaProvider {
  private host: string;
  private model: string;

  constructor(config: OllamaConfig) {
    this.host = config.host || 'http://127.0.0.1:11434';
    this.model = config.model;
  }

  async generateSummary(transcript: string, mode: 'sales' | 'general' = 'general'): Promise<{ summary: any; tokens: number; latencyMs: number }> {
    const start = Date.now();
    const system = 'You are a helpful assistant that returns a concise, structured JSON summary of a meeting transcript. Return only JSON.';
    const user = mode === 'sales'
      ? `Summarize the following sales-related transcript into a structured JSON capturing MEDDPICC-style info when present, otherwise keep fields empty. Use keys: executive_summary (string), summary_bullets (array), next_steps (array), risks (array), attendees (array), pain_points (array), decision_criteria (array), stakeholders (array of {name, role, influence}).\n\nTranscript:\n${transcript}`
      : `Summarize the following transcript into structured JSON with keys: executive_summary (string), summary_bullets (array), decisions (array), next_steps (array), risks (array), attendees (array).\n\nTranscript:\n${transcript}`;

    const resp = await fetch(`${this.host}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user }
        ],
        options: {
          temperature: 0.2
        },
        stream: false
      })
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Ollama error ${resp.status}: ${text}`);
    }
    const json = await resp.json();
    const content: string = json.message?.content || '';
    // Attempt to parse JSON from the content; if it isn't valid JSON, wrap it
    let summary: any;
    try {
      const cleaned = content.replace(/```json\n?|```\n?/g, '').trim();
      summary = JSON.parse(cleaned);
    } catch {
      summary = { executive_summary: content, summary_bullets: [], next_steps: [], risks: [], attendees: [] };
    }
    const latencyMs = Date.now() - start;
    return { summary, tokens: 0, latencyMs };
  }

  async generateMultipleSummaries(transcript: string, mode: 'sales' | 'general' = 'general'): Promise<SummaryVariant[]> {
    const approaches = [
      {
        id: 'detailed',
        approach: 'detailed' as const,
        temperature: 0.1,
        systemPrompt: mode === 'sales' 
          ? 'You are a detailed sales analyst. Provide comprehensive analysis with thorough MEDDPICC breakdown, risk assessment, and strategic insights.'
          : 'You are a thorough meeting analyst. Provide comprehensive coverage of all discussion points, decisions, and context.',
        userPrompt: mode === 'sales'
          ? `Provide a detailed sales analysis of this transcript. Include comprehensive MEDDPICC analysis, detailed stakeholder mapping, thorough risk assessment, and strategic recommendations. Use JSON format with keys: executive_summary (detailed), summary_bullets (comprehensive list), pain_points (detailed), decision_criteria (complete list), stakeholders (detailed with influence levels), risks (thorough analysis), next_steps (detailed action items).\n\nTranscript:\n${transcript}`
          : `Provide a comprehensive analysis of this meeting transcript. Include detailed coverage of all topics discussed, complete decision rationale, and thorough action planning. Use JSON format with keys: executive_summary (detailed), summary_bullets (comprehensive), decisions (with reasoning), next_steps (detailed), risks (thorough), attendees (with roles).\n\nTranscript:\n${transcript}`
      },
      {
        id: 'concise',
        approach: 'concise' as const,
        temperature: 0.2,
        systemPrompt: mode === 'sales'
          ? 'You are a concise sales summarizer. Focus on the most critical MEDDPICC elements and immediate action items. Be brief but precise.'
          : 'You are a concise meeting summarizer. Focus on key decisions and immediate action items. Be brief but cover essentials.',
        userPrompt: mode === 'sales'
          ? `Provide a concise sales summary focusing on the most critical elements. Highlight key MEDDPICC insights, major risks, and immediate next steps. Use JSON format with keys: executive_summary (brief), summary_bullets (key points only), pain_points (top 3), decision_criteria (critical only), stakeholders (key players), risks (major ones), next_steps (immediate actions).\n\nTranscript:\n${transcript}`
          : `Provide a concise meeting summary focusing on essential outcomes. Highlight key decisions and immediate action items. Use JSON format with keys: executive_summary (brief), summary_bullets (key points), decisions (main outcomes), next_steps (immediate actions), risks (if any), attendees.\n\nTranscript:\n${transcript}`
      },
      {
        id: 'action-focused',
        approach: 'action-focused' as const,
        temperature: 0.3,
        systemPrompt: mode === 'sales'
          ? 'You are an action-oriented sales coach. Focus primarily on next steps, opportunities to advance the deal, and tactical recommendations.'
          : 'You are an action-oriented meeting facilitator. Focus primarily on actionable outcomes, ownership, and follow-up requirements.',
        userPrompt: mode === 'sales'
          ? `Focus on actionable insights from this sales conversation. Prioritize next steps to advance the deal, opportunities to leverage, and tactical recommendations. Use JSON format with keys: executive_summary (action-oriented), summary_bullets (opportunity-focused), pain_points (actionable), decision_criteria (influence opportunities), stakeholders (engagement strategy), risks (mitigation actions), next_steps (specific tactics).\n\nTranscript:\n${transcript}`
          : `Focus on actionable outcomes from this meeting. Prioritize concrete next steps, ownership assignments, and follow-up requirements. Use JSON format with keys: executive_summary (action-focused), summary_bullets (actionable insights), decisions (implementation focus), next_steps (specific actions with owners), risks (actionable concerns), attendees.\n\nTranscript:\n${transcript}`
      }
    ];

    const variants: SummaryVariant[] = [];
    
    for (const approach of approaches) {
      const start = Date.now();
      
      try {
        const resp = await fetch(`${this.host}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: this.model,
            messages: [
              { role: 'system', content: approach.systemPrompt },
              { role: 'user', content: approach.userPrompt }
            ],
            options: {
              temperature: approach.temperature
            },
            stream: false
          })
        });

        if (!resp.ok) {
          console.warn(`Ollama error for ${approach.id}: ${resp.status}`);
          continue;
        }

        const json = await resp.json();
        const content: string = json.message?.content || '';
        
        let summary: any;
        try {
          const cleaned = content.replace(/```json\n?|```\n?/g, '').trim();
          summary = JSON.parse(cleaned);
        } catch {
          summary = { executive_summary: content, summary_bullets: [], next_steps: [], risks: [], attendees: [] };
        }

        const latencyMs = Date.now() - start;
        
        variants.push({
          id: approach.id,
          approach: approach.approach,
          summary,
          tokens: 0,
          latencyMs,
          temperature: approach.temperature
        });
      } catch (error) {
        console.warn(`Failed to generate ${approach.id} summary:`, error);
      }
    }

    return variants;
  }

  async generateAdaptiveSummary(
    transcript: string, 
    mode: 'sales' | 'general' = 'general',
    userPreferences?: { preferredApproach?: string; successfulPrompts?: string[] }
  ): Promise<{ summary: any; tokens: number; latencyMs: number }> {
    const start = Date.now();
    
    // Adapt the prompt based on user preferences
    let baseTemp = 0.2;
    let systemPrompt = 'You are a helpful assistant that returns a concise, structured JSON summary of a meeting transcript. Return only JSON.';
    let userPrompt = '';

    if (userPreferences?.preferredApproach) {
      // Adjust approach based on learned preferences
      switch (userPreferences.preferredApproach) {
        case 'detailed':
          baseTemp = 0.1;
          systemPrompt = mode === 'sales' 
            ? 'You are a detailed sales analyst. Provide comprehensive analysis with thorough MEDDPICC breakdown, risk assessment, and strategic insights.'
            : 'You are a thorough meeting analyst. Provide comprehensive coverage of all discussion points, decisions, and context.';
          break;
        case 'concise':
          baseTemp = 0.2;
          systemPrompt = mode === 'sales'
            ? 'You are a concise sales summarizer. Focus on the most critical MEDDPICC elements and immediate action items. Be brief but precise.'
            : 'You are a concise meeting summarizer. Focus on key decisions and immediate action items. Be brief but cover essentials.';
          break;
        case 'action-focused':
          baseTemp = 0.3;
          systemPrompt = mode === 'sales'
            ? 'You are an action-oriented sales coach. Focus primarily on next steps, opportunities to advance the deal, and tactical recommendations.'
            : 'You are an action-oriented meeting facilitator. Focus primarily on actionable outcomes, ownership, and follow-up requirements.';
          break;
      }
    }

    // Include successful example patterns if available
    let exampleContext = '';
    if (userPreferences?.successfulPrompts && userPreferences.successfulPrompts.length > 0) {
      exampleContext = `\n\nBased on your previous preferences, focus on patterns similar to these successful summaries: ${userPreferences.successfulPrompts.slice(0, 2).join(' ')}.`;
    }

    userPrompt = mode === 'sales'
      ? `Summarize the following sales-related transcript into a structured JSON capturing MEDDPICC-style info when present, otherwise keep fields empty. Use keys: executive_summary (string), summary_bullets (array), next_steps (array), risks (array), attendees (array), pain_points (array), decision_criteria (array), stakeholders (array of {name, role, influence}).${exampleContext}\n\nTranscript:\n${transcript}`
      : `Summarize the following transcript into structured JSON with keys: executive_summary (string), summary_bullets (array), decisions (array), next_steps (array), risks (array), attendees (array).${exampleContext}\n\nTranscript:\n${transcript}`;

    const resp = await fetch(`${this.host}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        options: {
          temperature: baseTemp
        },
        stream: false
      })
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Ollama error ${resp.status}: ${text}`);
    }
    
    const json = await resp.json();
    const content: string = json.message?.content || '';
    
    let summary: any;
    try {
      const cleaned = content.replace(/```json\n?|```\n?/g, '').trim();
      summary = JSON.parse(cleaned);
    } catch {
      summary = { executive_summary: content, summary_bullets: [], next_steps: [], risks: [], attendees: [] };
    }

    const latencyMs = Date.now() - start;
    return { summary, tokens: 0, latencyMs };
  }
}
