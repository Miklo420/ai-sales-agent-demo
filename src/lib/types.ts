import type { InferUITools, UIDataTypes, UIMessage } from "ai";
import type { createAgentTools, InterestLevel } from "./agent-tools";

export type AgentUITools = InferUITools<ReturnType<typeof createAgentTools>>;
export type LeadUIMessage = UIMessage<never, UIDataTypes, AgentUITools>;

export type LeadProfile = {
  name?: string;
  company?: string;
  niche?: string;
  needs?: string;
  budget?: string;
  budgetIsEstimate?: boolean;
  interestLevel?: InterestLevel;
  updatedAt?: string;
};

export type Appointment = {
  id: string;
  date: string;
  time: string;
  timeZone: string;
  leadName: string;
  company?: string;
  projectSummary: string;
  createdAt: string;
};

export type ToolName = keyof AgentUITools;

export type SyncEvent = {
  id: string; // toolCallId
  tool: ToolName;
  fields: string[];
};
