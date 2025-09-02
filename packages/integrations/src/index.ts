export interface IntegrationResult {
  success: boolean;
  id?: string;
  error?: string;
}

// HubSpot integration
export class HubSpotService {
  private apiKey: string;
  private dryRun: boolean;

  constructor(apiKey: string, dryRun = false) {
    this.apiKey = apiKey;
    this.dryRun = dryRun;
  }

  async createNote(params: {
    objectType: 'contact' | 'deal';
    objectId: string;
    markdown: string;
  }): Promise<IntegrationResult> {
    if (this.dryRun) {
      console.log('DRY RUN: Would create HubSpot note:', params);
      return { success: true, id: 'dry-run-note-123' };
    }

    // Real implementation would use @hubspot/api-client
    return { success: false, error: 'Not implemented' };
  }
}

// Gmail integration
export class GmailService {
  private accessToken: string;
  private dryRun: boolean;

  constructor(accessToken: string, dryRun = false) {
    this.accessToken = accessToken;
    this.dryRun = dryRun;
  }

  async createDraft(params: {
    to: string;
    subject: string;
    html: string;
  }): Promise<IntegrationResult> {
    if (this.dryRun) {
      console.log('DRY RUN: Would create Gmail draft:', params);
      return { success: true, id: 'dry-run-draft-123' };
    }

    // Real implementation would use googleapis
    return { success: false, error: 'Not implemented' };
  }
}