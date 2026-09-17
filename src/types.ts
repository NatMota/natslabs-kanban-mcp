export interface Project {
  id: number;
  key: string;
  name: string;
  description: string | null;
  repoPath: string | null;
  knowledgeProjectId: string | null;
  automationSettings: AutomationSettings | null;
  createdAt: string;
  updatedAt: string;
}

export interface Column {
  id: number;
  projectId: number;
  name: string;
  orderIndex: number;
  wipLimit: number | null;
}

export interface CompletionEvidenceItem {
  label: string;
  url: string;
  type: string;
}

export type TicketRunStatus =
  | 'planned'
  | 'queued'
  | 'launching'
  | 'running'
  | 'closing_out'
  | 'awaiting_review'
  | 'retry_pending'
  | 'waiting_on_children'
  | 'awaiting_child_confirmation'
  | 'completed'
  | 'failed'
  | 'blocked'
  | 'stopped'
  | 'cancelled';

export type TicketResumeState =
  | 'queued'
  | 'running'
  | 'waiting_on_previous_wave'
  | 'awaiting_child_confirmation'
  | 'ready_for_supervisor_review'
  | 'ready_for_retry'
  | 'done'
  | 'blocked'
  | 'cancelled';

export interface TicketWorkflow {
  status: string;
  columnId: number;
  progressState: ProgressState;
  completedAt: string | null;
  completionSummary: string | null;
  deploymentProof: string | null;
  completionEvidence: CompletionEvidenceItem[];
}

export interface TicketRunArtifact {
  id: number;
  runId: number;
  kind: string;
  label: string;
  url: string;
  mimeType: string | null;
  createdAt: string;
}

export interface TicketRunEvent {
  id: number;
  runId: number;
  eventType: string;
  message: string | null;
  payload: Record<string, unknown> | null;
  createdAt: string;
}

export interface TicketRun {
  id: number;
  ticketId: number;
  batchId: string | null;
  batchItemId: number | null;
  handoffId: string;
  threadId: string | null;
  executorBackend: string | null;
  runStatus: TicketRunStatus;
  resumeState: TicketResumeState | null;
  bundlePresent: boolean;
  patchApplied: boolean;
  deployUrl: string | null;
  terminalReason: string | null;
  promptId: string | null;
  promptVersion: string | null;
  promptManifestVersion: string | null;
  runtimeCommitSha: string | null;
  validationRequired: boolean;
  validationChecks: Record<string, unknown>[] | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
}

export interface TicketRunsSummary {
  current: TicketRun | null;
  historyCount: number;
}

export interface Ticket {
  id: number;
  projectId: number;
  columnId: number;
  title: string;
  description: string | null;
  estimate: number | null;
  status: string;
  progressState: ProgressState;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  completionSummary: string | null;
  deploymentProof: string | null;
  completionEvidence: CompletionEvidenceItem[];
  epicId: number | null;
  priority: number;
  workflow: TicketWorkflow;
  runs: TicketRunsSummary;
}

export interface BoardColumn extends Column {
  tickets: Ticket[];
}

export interface Board {
  project: Project;
  columns: BoardColumn[];
  epics: Epic[];
  automation: AutomationSettings;
}

export interface ProjectMetrics {
  burnup: {
    dates: string[];
    scope: number[];
    completed: number[];
  };
  burndown: {
    dates: string[];
    remaining: number[];
  };
  velocity: {
    weeks: string[];
    points: number[];
    average: number;
  };
}

export interface Epic {
  id: number;
  projectId: number;
  name: string;
  description: string | null;
  color: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TicketComment {
  id: number;
  ticketId: number;
  author: string | null;
  body: string;
  fileRefs: string[];
  createdAt: string;
}

export interface DocLink {
  id: number;
  projectId: number;
  ticketId: number | null;
  docPath: string;
  docsProjectId: string | null;
  linkType: string;
  createdAt: string;
  updatedAt: string;
}

export interface IntegrationEvent {
  id: number;
  projectId: number | null;
  direction: 'incoming' | 'outgoing';
  eventType: string;
  payload: Record<string, unknown>;
  status: 'pending' | 'processed';
  createdAt: string;
  processedAt: string | null;
}

export interface TicketBatchItem {
  id: number;
  batchId: string;
  ticketId: number;
  waveIndex: number;
  orderIndex: number;
  planningState: string | null;
  blockedByTicketId: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface TicketBatch {
  id: string;
  projectId: number;
  status: string;
  traceId: string | null;
  threadId: string | null;
  planningPayload: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  items: TicketBatchItem[];
}

export interface StagingLease {
  resourceKey: string;
  projectId: number;
  environment: 'staging';
  active: boolean;
  ownerId: string | null;
  ticketId: number | null;
  runId: number | null;
  candidateRef: string | null;
  baselineRef: string | null;
  fencingToken: number;
  acquiredAt: string | null;
  heartbeatAt: string | null;
  expiresAt: string | null;
  updatedAt: string;
}

export interface StagingLeaseAcquireResult {
  acquired: boolean;
  lease: StagingLease;
  leaseToken: string | null;
  retryAfterSeconds: number | null;
}

export interface StagingLeaseMutationResult {
  success: boolean;
  lease: StagingLease | null;
  reason: 'not_found' | 'not_holder' | 'expired' | null;
}

export type CopilotActionType = 'ticket.create' | 'ticket.update' | 'ticket.delete';

export interface CopilotActionPayload {
  [key: string]: unknown;
}

export type ProgressState = 'todo' | 'in_progress' | 'review' | 'done';

export interface AutomationSettings {
  version: number;
  columnStates: Record<string, ProgressState>;
}

export interface CopilotPendingAction {
  id: number;
  projectId: number;
  ticketId: number | null;
  actionType: CopilotActionType;
  summary: string;
  payload: CopilotActionPayload;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  resolvedAt: string | null;
}
