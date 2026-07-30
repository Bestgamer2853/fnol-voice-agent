export interface PromptTemplateSet {
  system: string;
  greeting: string;
  verificationFailed: string;
  callbackOffer: string;
  escalation: string;
  confirmation: string;
  empatheticAcknowledgment: string;
}

export interface PromptContext {
  companyName: string;
  callerName?: string;
  claimReferenceNumber?: string;
  missingFields: string[];
  escalationRequired: boolean;
}
