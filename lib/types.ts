export type AgentId = "bob" | "alice";

export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
  agentId?: AgentId;
}

export interface ConversationState {
  activeAgent: AgentId;
  messages: Message[];
  transcript: TranscriptEntry[];
}

export interface TranscriptEntry {
  id: string;
  speaker: "user" | AgentId;
  text: string;
  timestamp: number;
}

export interface ChatRequest {
  messages: Message[];
  activeAgent: AgentId;
}

export interface ChatResponse {
  reply: string;
  transfer?: AgentId;
  handoffSummary?: string;
}
