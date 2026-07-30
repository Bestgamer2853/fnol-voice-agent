export interface TransportMessage {
  type: 'user_audio_transcript' | 'assistant_response' | 'session_end';
  content: string;
  timestamp: string;
}

export interface VoiceTransport {
  connect(): void | Promise<void>;
  disconnect(): void | Promise<void>;
  sendAssistantMessage(message: string): void | Promise<void>;
  onUserMessage(handler: (message: TransportMessage) => void): void;
}
