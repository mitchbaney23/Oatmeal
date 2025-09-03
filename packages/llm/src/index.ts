export { SummaryPipeline, type PipelineResult, type PipelineMeta } from './chain';
export { OllamaProvider, type SummaryVariant } from './providers/ollama';
export { 
  meetingSummarySchema, 
  type MeetingSummary, 
  SUMMARY_SYSTEM_PROMPT,
  validateSummary,
  parseSummaryResponse 
} from './prompts/summary';
