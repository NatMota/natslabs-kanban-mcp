import db from './db';
import { randomUUID } from 'crypto';
import { AppError } from './errors';
import {
  Board,
  BoardColumn,
  Column,
  CopilotActionPayload,
  CopilotActionType,
  CopilotPendingAction,
  Epic,
  Project,
  ProjectMetrics,
  Ticket,
  TicketComment,
  DocLink,
  IntegrationEvent,
  AutomationSettings,
  ProgressState,
  CompletionEvidenceItem,
  TicketBatch,
  TicketBatchItem,
  TicketRun,
  TicketRunArtifact,
  TicketRunEvent,
  TicketResumeState,
  TicketRunStatus,
  TicketWorkflow,
  StagingLease,
  StagingLeaseAcquireResult,
  StagingLeaseMutationResult,
} from './types';

type ProjectRow = {
  id: number;
  key: string;
  name: string;
  description: string | null;
  repo_path: string | null;
  knowledge_project_id: string | null;
  automation_settings: string | null;
  created_at: string;
  updated_at: string;
};

type ColumnRow = {
  id: number;
  project_id: number;
  name: string;
  order_index: number;
  wip_limit: number | null;
};

type TicketRow = {
  id: number;
  project_id: number;
  column_id: number;
  title: string;
  description: string | null;
  estimate: number | null;
  status: string;
  progress_state: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  completion_summary: string | null;
  deployment_proof: string | null;
  completion_evidence: string | null;
  epic_id: number | null;
  priority: number | null;
};

type EpicRow = {
  id: number;
  project_id: number;
  name: string;
  description: string | null;
  color: string | null;
  created_at: string;
  updated_at: string;
};

type PendingActionRow = {
  id: number;
  project_id: number;
  ticket_id: number | null;
  action_type: string;
  payload: string;
  summary: string;
  status: string;
  created_at: string;
  resolved_at: string | null;
};

type TicketCommentRow = {
  id: number;
  ticket_id: number;
  author: string | null;
  body: string;
  file_refs: string | null;
  created_at: string;
};

type DocLinkRow = {
  id: number;
  project_id: number;
  ticket_id: number | null;
  doc_path: string;
  docs_project_id: string | null;
  link_type: string;
  created_at: string;
  updated_at: string;
};

type IntegrationEventRow = {
  id: number;
  project_id: number | null;
  direction: string;
  event_type: string;
  payload: string;
  status: string;
  created_at: string;
  processed_at: string | null;
};

type TicketBatchRow = {
  id: string;
  project_id: number;
  status: string;
  trace_id: string | null;
  thread_id: string | null;
  planning_payload: string | null;
  created_at: string;
  updated_at: string;
};

type TicketBatchItemRow = {
  id: number;
  batch_id: string;
  ticket_id: number;
  wave_index: number;
  order_index: number;
  planning_state: string | null;
  blocked_by_ticket_id: number | null;
  created_at: string;
  updated_at: string;
};

type TicketRunRow = {
  id: number;
  ticket_id: number;
  batch_id: string | null;
  batch_item_id: number | null;
  handoff_id: string;
  thread_id: string | null;
  executor_backend: string | null;
  run_status: string;
  resume_state: string | null;
  bundle_present: number;
  patch_applied: number;
  deploy_url: string | null;
  terminal_reason: string | null;
  prompt_id: string | null;
  prompt_version: string | null;
  prompt_manifest_version: string | null;
  runtime_commit_sha: string | null;
  validation_required: number;
  validation_checks: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  updated_at: string;
};

type TicketRunEventRow = {
  id: number;
  run_id: number;
  event_type: string;
  message: string | null;
  payload_json: string | null;
  created_at: string;
};

type TicketRunArtifactRow = {
  id: number;
  run_id: number;
  kind: string;
  label: string;
  url: string;
  mime_type: string | null;
  created_at: string;
};

type StagingLeaseRow = {
  project_id: number;
  environment: 'staging';
  owner_id: string | null;
  ticket_id: number | null;
  run_id: number | null;
  candidate_ref: string | null;
  baseline_ref: string | null;
  lease_token: string | null;
  fencing_token: number;
  acquired_at: string | null;
  heartbeat_at: string | null;
  expires_at: string | null;
  updated_at: string;
};

const projectSelect = db.prepare(`
  SELECT id, key, name, description, repo_path, knowledge_project_id, automation_settings, created_at, updated_at
  FROM projects
  ORDER BY name ASC
`);

const projectByKeySelect = db.prepare(`
  SELECT id, key, name, description, repo_path, knowledge_project_id, automation_settings, created_at, updated_at
  FROM projects
  WHERE key = ?
`);

const projectByIdSelect = db.prepare(`
  SELECT id, key, name, description, repo_path, knowledge_project_id, automation_settings, created_at, updated_at
  FROM projects
  WHERE id = ?
`);

const projectByKnowledgeIdSelect = db.prepare(`
  SELECT id, key, name, description, repo_path, knowledge_project_id, automation_settings, created_at, updated_at
  FROM projects
  WHERE knowledge_project_id = ?
`);

const columnSelectByProject = db.prepare(`
  SELECT id, project_id, name, order_index, wip_limit
  FROM columns
  WHERE project_id = ?
  ORDER BY order_index ASC, id ASC
`);

const ticketSelectByProject = db.prepare(`
  SELECT id, project_id, column_id, title, description, estimate, status, progress_state, created_at, updated_at, completed_at, completion_summary, deployment_proof, completion_evidence, epic_id, priority
  FROM tickets
  WHERE project_id = ?
  ORDER BY column_id ASC, priority ASC, created_at ASC, id ASC
`);

const ticketSelectById = db.prepare(`
  SELECT id, project_id, column_id, title, description, estimate, status, progress_state, created_at, updated_at, completed_at, completion_summary, deployment_proof, completion_evidence, epic_id, priority
  FROM tickets
  WHERE id = ?
`);

const columnSelectById = db.prepare(`
  SELECT id, project_id, name, order_index, wip_limit
  FROM columns
  WHERE id = ?
`);

const columnSelectByName = db.prepare(`
  SELECT id, project_id, name, order_index, wip_limit
  FROM columns
  WHERE project_id = ?
    AND lower(name) = lower(?)
`);

const epicSelectByProject = db.prepare(`
  SELECT id, project_id, name, description, color, created_at, updated_at
  FROM epics
  WHERE project_id = ?
  ORDER BY name COLLATE NOCASE ASC
`);

const epicSelectById = db.prepare(`
  SELECT id, project_id, name, description, color, created_at, updated_at
  FROM epics
  WHERE id = ?
`);

const epicSelectByName = db.prepare(`
  SELECT id, project_id, name, description, color, created_at, updated_at
  FROM epics
  WHERE project_id = ?
    AND lower(name) = lower(?)
`);

const epicInsert = db.prepare(`
  INSERT INTO epics (project_id, name, description, color)
  VALUES (@projectId, @name, @description, @color)
`);

const epicUpdateStmt = db.prepare(`
  UPDATE epics
  SET
    name = COALESCE(@name, name),
    description = CASE WHEN @descriptionSentinel = 1 THEN @description ELSE description END,
    color = CASE WHEN @colorSentinel = 1 THEN @color ELSE color END,
    updated_at = datetime('now')
  WHERE id = @id
`);

const epicDeleteStmt = db.prepare(`
  DELETE FROM epics
  WHERE id = ?
`);

const pendingActionsByProjectStmt = db.prepare(`
  SELECT id, project_id, ticket_id, action_type, payload, summary, status, created_at, resolved_at
  FROM copilot_pending_actions
  WHERE project_id = ?
  ORDER BY created_at ASC, id ASC
`);

const pendingActionByIdStmt = db.prepare(`
  SELECT id, project_id, ticket_id, action_type, payload, summary, status, created_at, resolved_at
  FROM copilot_pending_actions
  WHERE id = ?
`);

const insertPendingActionStmt = db.prepare(`
  INSERT INTO copilot_pending_actions (project_id, ticket_id, action_type, payload, summary)
  VALUES (@projectId, @ticketId, @actionType, @payload, @summary)
`);

const updatePendingActionStatusStmt = db.prepare(`
  UPDATE copilot_pending_actions
  SET status = @status,
      resolved_at = datetime('now'),
      resolved_by = @resolvedBy,
      ticket_id = COALESCE(@ticketId, ticket_id)
  WHERE id = @id
`);

const attachTicketToPendingActionStmt = db.prepare(`
  UPDATE copilot_pending_actions
  SET ticket_id = @ticketId
  WHERE id = @id
`);

const ticketRestoreStmt = db.prepare(`
  INSERT INTO tickets (
    id,
    project_id,
    column_id,
    title,
    description,
    estimate,
    status,
    progress_state,
    created_at,
    updated_at,
    completed_at,
    completion_summary,
    deployment_proof,
    completion_evidence,
    epic_id,
    priority
  )
  VALUES (
    @id,
    @projectId,
    @columnId,
    @title,
    @description,
    @estimate,
    @status,
    @progressState,
    @createdAt,
    @updatedAt,
    @completedAt,
    @completionSummary,
    @deploymentProof,
    @completionEvidence,
    @epicId,
    @priority
  )
`);

const ticketMaxPriorityByColumnStmt = db.prepare(`
  SELECT MAX(priority) AS maxPriority
  FROM tickets
  WHERE column_id = ?
`);

const ticketPriorityUpdateStmt = db.prepare(`
  UPDATE tickets
  SET
    column_id = @columnId,
    status = @status,
    progress_state = COALESCE(@progressState, progress_state),
    priority = @priority,
    completed_at = @completedAt,
    updated_at = datetime('now')
  WHERE id = @id
`);

const ticketAutomationUpdateStmt = db.prepare(`
  UPDATE tickets
  SET
    progress_state = @progressState,
    completed_at = CASE
      WHEN @progressState = 'done' THEN COALESCE(completed_at, datetime('now'))
      ELSE NULL
    END,
    updated_at = datetime('now')
  WHERE project_id = @projectId
    AND column_id = @columnId
`);

const ticketCreatedCountsStmt = db.prepare(`
  SELECT date(created_at) AS day, COUNT(*) AS total
  FROM tickets
  WHERE project_id = ?
  GROUP BY day
  ORDER BY day ASC
`);

const ticketCompletedCountsStmt = db.prepare(`
  SELECT date(completed_at) AS day, COUNT(*) AS total
  FROM tickets
  WHERE project_id = ?
    AND completed_at IS NOT NULL
  GROUP BY day
  ORDER BY day ASC
`);

const velocityPointsStmt = db.prepare(`
  SELECT strftime('%Y-%W', completed_at) AS week, SUM(COALESCE(estimate, 1)) AS points
  FROM tickets
  WHERE project_id = ?
    AND completed_at IS NOT NULL
    AND completed_at >= date('now', '-90 day')
  GROUP BY week
  ORDER BY week ASC
`);

const weekKeyStmt = db.prepare(`
  SELECT strftime('%Y-%W', ?) AS week
`);

const ticketCommentsSelectStmt = db.prepare(`
  SELECT id, ticket_id, author, body, file_refs, created_at
  FROM ticket_comments
  WHERE ticket_id = ?
  ORDER BY created_at DESC, id DESC
`);

const ticketCommentsInsertStmt = db.prepare(`
  INSERT INTO ticket_comments (ticket_id, author, body, file_refs)
  VALUES (@ticketId, @author, @body, @fileRefs)
`);

const docLinkUpsertStmt = db.prepare(`
  INSERT INTO docs_links (project_id, ticket_id, doc_path, docs_project_id, link_type)
  VALUES (@projectId, @ticketId, @docPath, @docsProjectId, @linkType)
  ON CONFLICT(project_id, ticket_id, doc_path, link_type)
  DO UPDATE SET docs_project_id = excluded.docs_project_id,
                updated_at = datetime('now')
`);

const docsLinksByTicketStmt = db.prepare(`
  SELECT id, project_id, ticket_id, doc_path, docs_project_id, link_type, created_at, updated_at
  FROM docs_links
  WHERE project_id = ? AND ticket_id = ?
  ORDER BY doc_path ASC, link_type ASC
`);

const docsLinksByDocStmt = db.prepare(`
  SELECT id, project_id, ticket_id, doc_path, docs_project_id, link_type, created_at, updated_at
  FROM docs_links
  WHERE project_id = ? AND doc_path = ?
  ORDER BY ticket_id ASC
`);

const docLinkSelectStmt = db.prepare(`
  SELECT id, project_id, ticket_id, doc_path, docs_project_id, link_type, created_at, updated_at
  FROM docs_links
  WHERE project_id = ? AND ticket_id = ? AND doc_path = ? AND link_type = ?
`);

const docsLinksByProjectStmt = db.prepare(`
  SELECT id, project_id, ticket_id, doc_path, docs_project_id, link_type, created_at, updated_at
  FROM docs_links
  WHERE project_id = ?
`);

const insertIntegrationEventStmt = db.prepare(`
  INSERT INTO integration_events (project_id, direction, event_type, payload, status)
  VALUES (@projectId, @direction, @eventType, @payload, @status)
`);

const listIntegrationEventsStmt = db.prepare(`
  SELECT id, project_id, direction, event_type, payload, status, created_at, processed_at
  FROM integration_events
  WHERE id > @since
    AND (@direction IS NULL OR direction = @direction)
  ORDER BY id ASC
`);

const markIntegrationEventProcessedStmt = db.prepare(`
  UPDATE integration_events
  SET status = 'processed',
      processed_at = datetime('now')
  WHERE id = ?
`);

const integrationEventSelectByIdStmt = db.prepare(`
  SELECT id, project_id, direction, event_type, payload, status, created_at, processed_at
  FROM integration_events
  WHERE id = ?
`);

const ticketBatchSelectByIdStmt = db.prepare(`
  SELECT id, project_id, status, trace_id, thread_id, planning_payload, created_at, updated_at
  FROM ticket_batches
  WHERE id = ?
`);

const ticketBatchItemsByBatchStmt = db.prepare(`
  SELECT id, batch_id, ticket_id, wave_index, order_index, planning_state, blocked_by_ticket_id, created_at, updated_at
  FROM ticket_batch_items
  WHERE batch_id = ?
  ORDER BY wave_index ASC, order_index ASC, id ASC
`);

const ticketRunSelectByIdStmt = db.prepare(`
  SELECT id, ticket_id, batch_id, batch_item_id, handoff_id, thread_id, executor_backend, run_status, resume_state,
         bundle_present, patch_applied, deploy_url, terminal_reason, prompt_id, prompt_version,
         prompt_manifest_version, runtime_commit_sha, validation_required, validation_checks,
         created_at, started_at, completed_at, updated_at
  FROM ticket_runs
  WHERE id = ?
`);

const ticketRunSelectByHandoffStmt = db.prepare(`
  SELECT id, ticket_id, batch_id, batch_item_id, handoff_id, thread_id, executor_backend, run_status, resume_state,
         bundle_present, patch_applied, deploy_url, terminal_reason, prompt_id, prompt_version,
         prompt_manifest_version, runtime_commit_sha, validation_required, validation_checks,
         created_at, started_at, completed_at, updated_at
  FROM ticket_runs
  WHERE handoff_id = ?
`);

const ticketRunsByTicketStmt = db.prepare(`
  SELECT id, ticket_id, batch_id, batch_item_id, handoff_id, thread_id, executor_backend, run_status, resume_state,
         bundle_present, patch_applied, deploy_url, terminal_reason, prompt_id, prompt_version,
         prompt_manifest_version, runtime_commit_sha, validation_required, validation_checks,
         created_at, started_at, completed_at, updated_at
  FROM ticket_runs
  WHERE ticket_id = ?
  ORDER BY datetime(created_at) DESC, id DESC
`);

const latestTicketRunByTicketStmt = db.prepare(`
  SELECT id, ticket_id, batch_id, batch_item_id, handoff_id, thread_id, executor_backend, run_status, resume_state,
         bundle_present, patch_applied, deploy_url, terminal_reason, prompt_id, prompt_version,
         prompt_manifest_version, runtime_commit_sha, validation_required, validation_checks,
         created_at, started_at, completed_at, updated_at
  FROM ticket_runs
  WHERE ticket_id = ?
  ORDER BY datetime(created_at) DESC, id DESC
  LIMIT 1
`);

const ticketRunCountByTicketStmt = db.prepare(`
  SELECT COUNT(1) AS total
  FROM ticket_runs
  WHERE ticket_id = ?
`);

const ticketRunEventsByRunStmt = db.prepare(`
  SELECT id, run_id, event_type, message, payload_json, created_at
  FROM ticket_run_events
  WHERE run_id = ?
  ORDER BY datetime(created_at) ASC, id ASC
`);

const ticketRunArtifactsByRunStmt = db.prepare(`
  SELECT id, run_id, kind, label, url, mime_type, created_at
  FROM ticket_run_artifacts
  WHERE run_id = ?
  ORDER BY datetime(created_at) ASC, id ASC
`);

const ticketBatchInsertStmt = db.prepare(`
  INSERT INTO ticket_batches (id, project_id, status, trace_id, thread_id, planning_payload)
  VALUES (@id, @projectId, @status, @traceId, @threadId, @planningPayload)
`);

const ticketBatchUpdateStmt = db.prepare(`
  UPDATE ticket_batches
  SET status = COALESCE(@status, status),
      trace_id = COALESCE(@traceId, trace_id),
      thread_id = COALESCE(@threadId, thread_id),
      planning_payload = COALESCE(@planningPayload, planning_payload),
      updated_at = datetime('now')
  WHERE id = @id
`);

const ticketBatchItemUpsertStmt = db.prepare(`
  INSERT INTO ticket_batch_items (batch_id, ticket_id, wave_index, order_index, planning_state, blocked_by_ticket_id)
  VALUES (@batchId, @ticketId, @waveIndex, @orderIndex, @planningState, @blockedByTicketId)
  ON CONFLICT(batch_id, ticket_id)
  DO UPDATE SET
    wave_index = excluded.wave_index,
    order_index = excluded.order_index,
    planning_state = excluded.planning_state,
    blocked_by_ticket_id = excluded.blocked_by_ticket_id,
    updated_at = datetime('now')
`);

const ticketBatchItemByBatchTicketStmt = db.prepare(`
  SELECT id, batch_id, ticket_id, wave_index, order_index, planning_state, blocked_by_ticket_id, created_at, updated_at
  FROM ticket_batch_items
  WHERE batch_id = ? AND ticket_id = ?
`);

const ticketRunInsertStmt = db.prepare(`
  INSERT INTO ticket_runs (
    ticket_id, batch_id, batch_item_id, handoff_id, thread_id, executor_backend, run_status, resume_state,
    bundle_present, patch_applied, deploy_url, terminal_reason, prompt_id, prompt_version, prompt_manifest_version,
    runtime_commit_sha, validation_required, validation_checks, started_at, completed_at
  ) VALUES (
    @ticketId, @batchId, @batchItemId, @handoffId, @threadId, @executorBackend, @runStatus, @resumeState,
    @bundlePresent, @patchApplied, @deployUrl, @terminalReason, @promptId, @promptVersion, @promptManifestVersion,
    @runtimeCommitSha, @validationRequired, @validationChecks, @startedAt, @completedAt
  )
`);

const ticketRunUpdateStmt = db.prepare(`
  UPDATE ticket_runs
  SET batch_id = COALESCE(@batchId, batch_id),
      batch_item_id = COALESCE(@batchItemId, batch_item_id),
      thread_id = COALESCE(@threadId, thread_id),
      executor_backend = COALESCE(@executorBackend, executor_backend),
      run_status = COALESCE(@runStatus, run_status),
      resume_state = CASE WHEN @resumeStateSentinel = 1 THEN @resumeState ELSE resume_state END,
      bundle_present = COALESCE(@bundlePresent, bundle_present),
      patch_applied = COALESCE(@patchApplied, patch_applied),
      deploy_url = CASE WHEN @deployUrlSentinel = 1 THEN @deployUrl ELSE deploy_url END,
      terminal_reason = CASE WHEN @terminalReasonSentinel = 1 THEN @terminalReason ELSE terminal_reason END,
      prompt_id = COALESCE(@promptId, prompt_id),
      prompt_version = COALESCE(@promptVersion, prompt_version),
      prompt_manifest_version = COALESCE(@promptManifestVersion, prompt_manifest_version),
      runtime_commit_sha = COALESCE(@runtimeCommitSha, runtime_commit_sha),
      validation_required = COALESCE(@validationRequired, validation_required),
      validation_checks = CASE WHEN @validationChecksSentinel = 1 THEN @validationChecks ELSE validation_checks END,
      started_at = COALESCE(@startedAt, started_at),
      completed_at = CASE WHEN @completedAtSentinel = 1 THEN @completedAt ELSE completed_at END,
      updated_at = datetime('now')
  WHERE id = @id
`);

const ticketRunEventInsertStmt = db.prepare(`
  INSERT INTO ticket_run_events (run_id, event_type, message, payload_json)
  VALUES (@runId, @eventType, @message, @payloadJson)
`);

const ticketRunArtifactInsertStmt = db.prepare(`
  INSERT INTO ticket_run_artifacts (run_id, kind, label, url, mime_type)
  VALUES (@runId, @kind, @label, @url, @mimeType)
`);

const stagingLeaseSelectStmt = db.prepare(`
  SELECT project_id, environment, owner_id, ticket_id, run_id, candidate_ref, baseline_ref,
         lease_token, fencing_token, acquired_at, heartbeat_at, expires_at, updated_at
  FROM staging_leases
  WHERE project_id = ? AND environment = 'staging'
`);

const stagingLeaseUpsertStmt = db.prepare(`
  INSERT INTO staging_leases (
    project_id, environment, owner_id, ticket_id, run_id, candidate_ref, baseline_ref,
    lease_token, fencing_token, acquired_at, heartbeat_at, expires_at, updated_at
  ) VALUES (
    @projectId, 'staging', @ownerId, @ticketId, @runId, @candidateRef, @baselineRef,
    @leaseToken, @fencingToken, @now, @now, @expiresAt, @now
  )
  ON CONFLICT(project_id, environment)
  DO UPDATE SET
    owner_id = excluded.owner_id,
    ticket_id = excluded.ticket_id,
    run_id = excluded.run_id,
    candidate_ref = excluded.candidate_ref,
    baseline_ref = excluded.baseline_ref,
    lease_token = excluded.lease_token,
    fencing_token = excluded.fencing_token,
    acquired_at = excluded.acquired_at,
    heartbeat_at = excluded.heartbeat_at,
    expires_at = excluded.expires_at,
    updated_at = excluded.updated_at
`);

const stagingLeaseHeartbeatStmt = db.prepare(`
  UPDATE staging_leases
  SET heartbeat_at = @now,
      expires_at = @expiresAt,
      updated_at = @now
  WHERE project_id = @projectId
    AND environment = 'staging'
    AND lease_token = @leaseToken
    AND fencing_token = @fencingToken
`);

const stagingLeaseReleaseStmt = db.prepare(`
  UPDATE staging_leases
  SET owner_id = NULL,
      ticket_id = NULL,
      run_id = NULL,
      candidate_ref = NULL,
      baseline_ref = NULL,
      lease_token = NULL,
      acquired_at = NULL,
      heartbeat_at = NULL,
      expires_at = NULL,
      updated_at = @now
  WHERE project_id = @projectId
    AND environment = 'staging'
    AND lease_token = @leaseToken
    AND fencing_token = @fencingToken
`);

const DEFAULT_COLUMNS = ['Backlog', 'In Progress', 'Review', 'Done'];
export const DEFAULT_SCRUM_VALUES = [0, 0.5, 1, 2, 3, 5, 8, 13, 21];
const DONE_COLUMN_NAMES = new Set(['done', 'completed', 'complete']);
const REVIEW_COLUMN_NAMES = new Set(['review', 'qa', 'testing']);
const TODO_COLUMN_NAMES = new Set(['backlog', 'todo', 'to do', 'ready', 'next', 'up next', 'not started']);

const VALID_PROGRESS_STATES: ProgressState[] = ['todo', 'in_progress', 'review', 'done'];
const AUTOMATION_SETTINGS_VERSION = 1;

function isValidProgressState(value: unknown): value is ProgressState {
  return typeof value === 'string' && (VALID_PROGRESS_STATES as string[]).includes(value);
}

function parseAutomationSettings(raw: string | null): AutomationSettings | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    const version = typeof parsed.version === 'number' ? parsed.version : AUTOMATION_SETTINGS_VERSION;
    const columnStates: Record<string, ProgressState> = {};
    const rawStates = typeof parsed.columnStates === 'object' && parsed.columnStates !== null ? parsed.columnStates : {};
    Object.entries(rawStates).forEach(([key, value]) => {
      if (isValidProgressState(value)) {
        columnStates[key] = value;
      }
    });
    return {
      version,
      columnStates,
    };
  } catch {
    return null;
  }
}

function serializeAutomationSettings(settings: AutomationSettings): string {
  return JSON.stringify({
    version: settings.version ?? AUTOMATION_SETTINGS_VERSION,
    columnStates: settings.columnStates ?? {},
  });
}

function normalizeEpicName(name: string): string {
  return name.trim();
}

function normalizeOptionalColor(color: string | null | undefined): string | null {
  if (color === undefined || color === null) {
    return null;
  }
  const trimmed = color.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function normalizeOptionalDescription(description: string | null | undefined): string | null {
  if (description === undefined || description === null) {
    return null;
  }
  if (description.trim().length === 0) {
    return null;
  }
  return description;
}

function deriveProgressState(
  projectId: number,
  column: Column | undefined,
  settingsOverride?: AutomationSettings
): ProgressState {
  if (!column) {
    return 'in_progress';
  }
  const settings = settingsOverride ?? getProjectAutomationSettings(projectId);
  return getColumnState(settings, column.id);
}

function mapProject(row: ProjectRow): Project {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    description: row.description,
    repoPath: row.repo_path ?? null,
    knowledgeProjectId: row.knowledge_project_id ?? null,
    automationSettings: parseAutomationSettings(row.automation_settings),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function inferDefaultProgressState(column: Column, index: number): ProgressState {
  if (DONE_COLUMN_NAMES.has(column.name.trim().toLowerCase())) {
    return 'done';
  }
  if (REVIEW_COLUMN_NAMES.has(column.name.trim().toLowerCase())) {
    return 'review';
  }
  if (TODO_COLUMN_NAMES.has(column.name.trim().toLowerCase()) || index === 0) {
    return 'todo';
  }
  return 'in_progress';
}

function normalizeAutomationSettings(
  projectId: number,
  settings: AutomationSettings | null,
  columnsOverride?: Column[]
): AutomationSettings {
  const columns = columnsOverride ?? getColumns(projectId);
  const columnStates: Record<string, ProgressState> = {};
  const source = settings?.columnStates ?? {};
  columns.forEach((column, index) => {
    const key = String(column.id);
    const rawState = source[key];
    if (isValidProgressState(rawState)) {
      columnStates[key] = rawState;
    } else {
      columnStates[key] = inferDefaultProgressState(column, index);
    }
  });
  return {
    version: AUTOMATION_SETTINGS_VERSION,
    columnStates,
  };
}

function getColumnState(settings: AutomationSettings, columnId: number): ProgressState {
  return settings.columnStates[String(columnId)] ?? 'in_progress';
}

function mapColumn(row: ColumnRow): Column {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    orderIndex: row.order_index,
    wipLimit: row.wip_limit,
  };
}

function mapTicket(row: TicketRow): Ticket {
  const completionEvidence = parseCompletionEvidence(row.completion_evidence);
  const workflow: TicketWorkflow = {
    status: row.status,
    columnId: row.column_id,
    progressState: (row.progress_state as Ticket['progressState']) ?? 'in_progress',
    completedAt: row.completed_at,
    completionSummary: row.completion_summary ?? null,
    deploymentProof: row.deployment_proof ?? null,
    completionEvidence,
  };
  return {
    id: row.id,
    projectId: row.project_id,
    columnId: row.column_id,
    title: row.title,
    description: row.description,
    estimate: row.estimate,
    status: row.status,
    progressState: workflow.progressState,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: workflow.completedAt,
    completionSummary: workflow.completionSummary,
    deploymentProof: workflow.deploymentProof,
    completionEvidence,
    epicId: row.epic_id,
    priority: row.priority ?? 0,
    workflow,
    runs: {
      current: getLatestTicketRunByTicketIdInternal(row.id),
      historyCount: getTicketRunHistoryCountInternal(row.id),
    },
  };
}

function mapEpic(row: EpicRow): Epic {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    description: row.description,
    color: row.color,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseActionPayload(payload: string): CopilotActionPayload {
  try {
    const parsed = JSON.parse(payload);
    if (parsed && typeof parsed === 'object') {
      return parsed as CopilotActionPayload;
    }
  } catch {
    // ignore parse error, fall through
  }
  return {};
}

function mapPendingAction(row: PendingActionRow): CopilotPendingAction {
  return {
    id: row.id,
    projectId: row.project_id,
    ticketId: row.ticket_id,
    actionType: row.action_type as CopilotActionType,
    payload: parseActionPayload(row.payload),
    summary: row.summary,
    status: row.status as CopilotPendingAction['status'],
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
  };
}

function applyAutomationSettingsToTickets(projectId: number, settings: AutomationSettings): void {
  const txn = db.transaction((entries: Array<[string, ProgressState]>) => {
    entries.forEach(([columnId, progressState]) => {
      ticketAutomationUpdateStmt.run({
        projectId,
        columnId: Number(columnId),
        progressState,
      });
    });
  });

  txn(Object.entries(settings.columnStates));
}

function parseFileRefs(value: string | null): string[] {
  if (!value) {
    return [];
  }
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function coerceCompletionEvidenceItem(value: unknown): CompletionEvidenceItem | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const raw = value as {
    label?: unknown;
    url?: unknown;
    type?: unknown;
  };
  const label = typeof raw.label === 'string' ? raw.label.trim() : '';
  const url = typeof raw.url === 'string' ? raw.url.trim() : '';
  const type = typeof raw.type === 'string' ? raw.type.trim() : '';

  if (!label || !url || !type) {
    return null;
  }

  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      return null;
    }
  } catch {
    return null;
  }

  return { label, url, type };
}

function parseCompletionEvidence(value: string | null): CompletionEvidenceItem[] {
  if (!value) {
    return [];
  }
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map((item) => coerceCompletionEvidenceItem(item))
      .filter((item): item is CompletionEvidenceItem => Boolean(item));
  } catch {
    return [];
  }
}

function normalizeCompletionEvidenceInput(value: unknown): CompletionEvidenceItem[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new AppError('Completion evidence must be an array of evidence items.', 400);
  }
  return value.map((item, index) => {
    const normalized = coerceCompletionEvidenceItem(item);
    if (!normalized) {
      throw new AppError(
        `Completion evidence item ${index + 1} must include non-empty label, url, and type fields.`,
        400
      );
    }
    return normalized;
  });
}

function serializeCompletionEvidence(value: CompletionEvidenceItem[] | null | undefined): string | null {
  if (!value || value.length === 0) {
    return null;
  }
  return JSON.stringify(value);
}

function parseJsonRecord(value: string | null): Record<string, unknown> | null {
  if (!value) {
    return null;
  }
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // ignore malformed JSON
  }
  return null;
}

function parseJsonRecordArray(value: string | null): Record<string, unknown>[] | null {
  if (!value) {
    return null;
  }
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return null;
    }
    return parsed.filter(
      (item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item)
    );
  } catch {
    return null;
  }
}

function serializeJsonValue(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  return JSON.stringify(value);
}

function mapTicketBatchItem(row: TicketBatchItemRow): TicketBatchItem {
  return {
    id: row.id,
    batchId: row.batch_id,
    ticketId: row.ticket_id,
    waveIndex: row.wave_index,
    orderIndex: row.order_index,
    planningState: row.planning_state,
    blockedByTicketId: row.blocked_by_ticket_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapTicketRun(row: TicketRunRow): TicketRun {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    batchId: row.batch_id,
    batchItemId: row.batch_item_id,
    handoffId: row.handoff_id,
    threadId: row.thread_id,
    executorBackend: row.executor_backend,
    runStatus: row.run_status as TicketRunStatus,
    resumeState: (row.resume_state as TicketResumeState | null) ?? null,
    bundlePresent: Boolean(row.bundle_present),
    patchApplied: Boolean(row.patch_applied),
    deployUrl: row.deploy_url,
    terminalReason: row.terminal_reason,
    promptId: row.prompt_id,
    promptVersion: row.prompt_version,
    promptManifestVersion: row.prompt_manifest_version,
    runtimeCommitSha: row.runtime_commit_sha,
    validationRequired: Boolean(row.validation_required),
    validationChecks: parseJsonRecordArray(row.validation_checks),
    createdAt: row.created_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    updatedAt: row.updated_at,
  };
}

function mapTicketRunEvent(row: TicketRunEventRow): TicketRunEvent {
  return {
    id: row.id,
    runId: row.run_id,
    eventType: row.event_type,
    message: row.message,
    payload: parseJsonRecord(row.payload_json),
    createdAt: row.created_at,
  };
}

function mapTicketRunArtifact(row: TicketRunArtifactRow): TicketRunArtifact {
  return {
    id: row.id,
    runId: row.run_id,
    kind: row.kind,
    label: row.label,
    url: row.url,
    mimeType: row.mime_type,
    createdAt: row.created_at,
  };
}

function isLeaseActive(row: StagingLeaseRow, now: Date): boolean {
  if (!row.lease_token || !row.expires_at) {
    return false;
  }
  const expiresAt = Date.parse(row.expires_at);
  return Number.isFinite(expiresAt) && expiresAt > now.getTime();
}

function mapStagingLease(row: StagingLeaseRow, now: Date): StagingLease {
  const projectKey = getProjectById(row.project_id)?.key ?? String(row.project_id);
  return {
    resourceKey: `${projectKey}:staging`,
    projectId: row.project_id,
    environment: 'staging',
    active: isLeaseActive(row, now),
    ownerId: row.owner_id,
    ticketId: row.ticket_id,
    runId: row.run_id,
    candidateRef: row.candidate_ref,
    baselineRef: row.baseline_ref,
    fencingToken: row.fencing_token,
    acquiredAt: row.acquired_at,
    heartbeatAt: row.heartbeat_at,
    expiresAt: row.expires_at,
    updatedAt: row.updated_at,
  };
}

function mapTicketBatch(row: TicketBatchRow, items: TicketBatchItem[] = []): TicketBatch {
  return {
    id: row.id,
    projectId: row.project_id,
    status: row.status,
    traceId: row.trace_id,
    threadId: row.thread_id,
    planningPayload: parseJsonRecord(row.planning_payload),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    items,
  };
}

function getLatestTicketRunByTicketIdInternal(ticketId: number): TicketRun | null {
  const row = latestTicketRunByTicketStmt.get(ticketId) as TicketRunRow | undefined;
  return row ? mapTicketRun(row) : null;
}

function getTicketRunHistoryCountInternal(ticketId: number): number {
  const row = ticketRunCountByTicketStmt.get(ticketId) as { total: number } | undefined;
  return row?.total ?? 0;
}

function mapTicketComment(row: TicketCommentRow): TicketComment {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    author: row.author,
    body: row.body,
    fileRefs: parseFileRefs(row.file_refs),
    createdAt: row.created_at,
  };
}

function mapDocLink(row: DocLinkRow): DocLink {
  return {
    id: row.id,
    projectId: row.project_id,
    ticketId: row.ticket_id,
    docPath: row.doc_path,
    docsProjectId: row.docs_project_id,
    linkType: row.link_type,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapIntegrationEvent(row: IntegrationEventRow): IntegrationEvent {
  return {
    id: row.id,
    projectId: row.project_id,
    direction: (row.direction as 'incoming' | 'outgoing') ?? 'outgoing',
    eventType: row.event_type,
    payload: JSON.parse(row.payload ?? '{}'),
    status: (row.status as IntegrationEvent['status']) ?? 'pending',
    createdAt: row.created_at,
    processedAt: row.processed_at,
  };
}

export function listProjects(): Project[] {
  const rows = projectSelect.all() as ProjectRow[];
  return rows.map(mapProject);
}

export function getProjectByKey(key: string): Project | undefined {
  const row = projectByKeySelect.get(key) as ProjectRow | undefined;
  return row ? mapProject(row) : undefined;
}

export function getProjectById(id: number): Project | undefined {
  const row = projectByIdSelect.get(id) as ProjectRow | undefined;
  return row ? mapProject(row) : undefined;
}

export function getProjectByKnowledgeId(knowledgeId: string): Project | undefined {
  const row = projectByKnowledgeIdSelect.get(knowledgeId) as ProjectRow | undefined;
  return row ? mapProject(row) : undefined;
}

export function createProject(data: {
  key: string;
  name: string;
  description?: string | null;
  columns?: string[];
  repoPath?: string | null;
  knowledgeProjectId?: string | null;
}): Project {
  const insertProject = db.prepare(`
    INSERT INTO projects (key, name, description, repo_path, knowledge_project_id)
    VALUES (@key, @name, @description, @repoPath, @knowledgeProjectId)
  `);

  const info = insertProject.run({
    key: data.key,
    name: data.name,
    description: data.description ?? null,
    repoPath: data.repoPath ?? null,
    knowledgeProjectId: data.knowledgeProjectId ?? null,
  });

  const project = getProjectById(Number(info.lastInsertRowid));
  if (!project) {
    throw new Error('Failed to create project');
  }

  ensureColumnsForProject(project.id, data.columns ?? DEFAULT_COLUMNS);

  return project;
}

const updateProjectRepoPathStmt = db.prepare(`
  UPDATE projects
  SET repo_path = @repoPath,
      updated_at = datetime('now')
  WHERE id = @projectId
`);

const updateProjectKnowledgeIdStmt = db.prepare(`
  UPDATE projects
  SET knowledge_project_id = @knowledgeProjectId,
      updated_at = datetime('now')
  WHERE id = @projectId
`);

const updateProjectAutomationStmt = db.prepare(`
  UPDATE projects
  SET automation_settings = @settings,
      updated_at = datetime('now')
  WHERE id = @projectId
`);

export function setProjectRepoPath(projectId: number, repoPath: string | null): Project {
  updateProjectRepoPathStmt.run({
    projectId,
    repoPath,
  });
  const project = getProjectById(projectId);
  if (!project) {
    throw new Error('Project not found after repo path update');
  }
  return project;
}

export function setProjectKnowledgeId(projectId: number, knowledgeProjectId: string | null): Project {
  updateProjectKnowledgeIdStmt.run({
    projectId,
    knowledgeProjectId,
  });
  const project = getProjectById(projectId);
  if (!project) {
    throw new Error('Project not found after knowledge id update');
  }
  return project;
}

export function getProjectAutomationSettings(projectId: number): AutomationSettings {
  const project = getProjectById(projectId);
  return normalizeAutomationSettings(projectId, project?.automationSettings ?? null);
}

export function setProjectAutomationSettings(projectId: number, settings: AutomationSettings): AutomationSettings {
  const normalized = normalizeAutomationSettings(projectId, settings);
  updateProjectAutomationStmt.run({
    projectId,
    settings: serializeAutomationSettings(normalized),
  });
  applyAutomationSettingsToTickets(projectId, normalized);
  return normalized;
}

type NewPendingAction = {
  actionType: CopilotActionType;
  ticketId?: number | null;
  summary: string;
  payload: CopilotActionPayload;
};

export function createPendingActions(projectId: number, actions: NewPendingAction[]): CopilotPendingAction[] {
  if (actions.length === 0) {
    return [];
  }

  const run = db.transaction((items: NewPendingAction[]) => {
    const inserted: CopilotPendingAction[] = [];
    items.forEach((action) => {
      const payloadString = JSON.stringify(action.payload ?? {});
      const info = insertPendingActionStmt.run({
        projectId,
        ticketId: action.ticketId ?? null,
        actionType: action.actionType,
        payload: payloadString,
        summary: action.summary,
      });
      const row = pendingActionByIdStmt.get(Number(info.lastInsertRowid)) as PendingActionRow;
      inserted.push(mapPendingAction(row));
    });
    return inserted;
  });

  return run(actions);
}

export function listPendingActions(projectId: number, statuses: Array<CopilotPendingAction['status']> = ['pending']): CopilotPendingAction[] {
  const rows = pendingActionsByProjectStmt.all(projectId) as PendingActionRow[];
  const allowed = new Set(statuses);
  return rows.map(mapPendingAction).filter((action) => allowed.has(action.status));
}

export function getPendingActionById(actionId: number): CopilotPendingAction | undefined {
  const row = pendingActionByIdStmt.get(actionId) as PendingActionRow | undefined;
  return row ? mapPendingAction(row) : undefined;
}

export function markPendingActionStatus(
  actionId: number,
  status: 'approved' | 'rejected',
  options: { resolvedBy?: string | null; ticketId?: number | null } = {}
): CopilotPendingAction {
  updatePendingActionStatusStmt.run({
    id: actionId,
    status,
    resolvedBy: options.resolvedBy ?? null,
    ticketId: options.ticketId ?? null,
  });
  const updated = pendingActionByIdStmt.get(actionId) as PendingActionRow | undefined;
  if (!updated) {
    throw new Error('Pending action not found after update');
  }
  return mapPendingAction(updated);
}

function resolveColumnId(projectId: number, payload: CopilotActionPayload): number | undefined {
  if (typeof payload.columnId === 'number') {
    return payload.columnId;
  }
  if (typeof payload.columnName === 'string' && payload.columnName.trim().length > 0) {
    const column = getColumnByName(projectId, payload.columnName.trim());
    if (column) {
      return column.id;
    }
  }
  return undefined;
}

function resolveEpic(
  projectId: number,
  payload: CopilotActionPayload
): { epicId?: number | null; epicName?: string | null } {
  if (payload.epicId === null) {
    return { epicId: null };
  }
  if (typeof payload.epicId === 'number') {
    const epic = getEpicById(payload.epicId);
    if (!epic || epic.projectId !== projectId) {
      throw new AppError('Epic does not belong to the same project', 400);
    }
    return { epicId: epic.id };
  }
  if (typeof payload.epicName === 'string' && payload.epicName.trim().length > 0) {
    const normalized = payload.epicName.trim();
    const existingEpic = getEpicByName(projectId, normalized);
    if (existingEpic) {
      return { epicId: existingEpic.id };
    }
    const created = createEpic(projectId, { name: normalized });
    return { epicId: created.id };
  }
  return {};
}

export function applyPendingAction(
  actionId: number,
  options: { resolvedBy?: string | null } = {}
): { action: CopilotPendingAction; ticket?: Ticket | null } {
  const pending = getPendingActionById(actionId);
  if (!pending) {
    throw new AppError('Pending action not found', 404);
  }
  if (pending.status !== 'pending') {
    throw new AppError('Pending action already resolved', 400);
  }

  const payload = pending.payload ?? {};
  let ticketResult: Ticket | null = null;

  switch (pending.actionType) {
    case 'ticket.create': {
      const title =
        typeof payload.title === 'string' && payload.title.trim().length > 0 ? payload.title.trim() : undefined;
      if (!title) {
        throw new AppError('Proposed ticket creation is missing a title', 400);
      }
      const columnId = resolveColumnId(pending.projectId, payload);
      const description =
        typeof payload.description === 'string' ? payload.description : payload.description == null ? null : String(payload.description);
      const estimate =
        typeof payload.estimate === 'number' && Number.isFinite(payload.estimate) ? payload.estimate : null;
      const epicInfo = resolveEpic(pending.projectId, payload);
      const progressState =
        typeof payload.progressState === 'string' && ['in_progress', 'review', 'done'].includes(payload.progressState)
          ? (payload.progressState as Ticket['progressState'])
          : undefined;
      ticketResult = createTicket(pending.projectId, {
        columnId,
        title,
        description,
        estimate,
        epicId: epicInfo.epicId,
        epicName: epicInfo.epicName,
        progressState,
      });
      attachTicketToPendingActionStmt.run({
        id: actionId,
        ticketId: ticketResult.id,
      });
      break;
    }
    case 'ticket.update': {
      const targetTicketId =
        typeof pending.ticketId === 'number'
          ? pending.ticketId
          : typeof payload.ticketId === 'number'
          ? payload.ticketId
          : undefined;
      if (!targetTicketId) {
        throw new AppError('Update action is missing ticketId', 400);
      }
      const updateData: {
        title?: string;
        description?: string | null;
        columnId?: number;
        estimate?: number | null;
        epicId?: number | null;
        epicName?: string | null;
        progressState?: Ticket['progressState'];
      } = {};
      if (typeof payload.title === 'string') {
        updateData.title = payload.title;
      }
      if (payload.description === null) {
        updateData.description = null;
      } else if (typeof payload.description === 'string') {
        updateData.description = payload.description;
      }
      if (payload.estimate === null) {
        updateData.estimate = null;
      } else if (typeof payload.estimate === 'number' && Number.isFinite(payload.estimate)) {
        updateData.estimate = payload.estimate;
      }
      const columnId = resolveColumnId(pending.projectId, payload);
      if (columnId !== undefined) {
        updateData.columnId = columnId;
      }
      if (typeof payload.progressState === 'string' && ['in_progress', 'review', 'done'].includes(payload.progressState)) {
        updateData.progressState = payload.progressState as Ticket['progressState'];
      }
      const epicInfo = resolveEpic(pending.projectId, payload);
      if ('epicId' in epicInfo) {
        updateData.epicId = epicInfo.epicId ?? null;
      }
      if ('epicName' in epicInfo) {
        updateData.epicName = epicInfo.epicName ?? null;
      }
      ticketResult = updateTicket(targetTicketId, updateData);
      break;
    }
    case 'ticket.delete': {
      const targetTicketId =
        typeof pending.ticketId === 'number'
          ? pending.ticketId
          : typeof payload.ticketId === 'number'
          ? payload.ticketId
          : undefined;
      if (!targetTicketId) {
        throw new AppError('Delete action is missing ticketId', 400);
      }
      const existing = getTicketById(targetTicketId);
      if (!existing) {
        throw new AppError('Ticket not found for deletion', 404);
      }
      deleteTicket(targetTicketId);
      ticketResult = existing;
      break;
    }
    default:
      throw new AppError(`Unsupported action type: ${pending.actionType}`, 400);
  }

  const updated = markPendingActionStatus(actionId, 'approved', {
    resolvedBy: options.resolvedBy ?? null,
    ticketId: ticketResult ? ticketResult.id : pending.ticketId ?? null,
  });
  return { action: updated, ticket: ticketResult };
}

export function rejectPendingAction(
  actionId: number,
  options: { resolvedBy?: string | null } = {}
): CopilotPendingAction {
  const pending = getPendingActionById(actionId);
  if (!pending) {
    throw new AppError('Pending action not found', 404);
  }
  if (pending.status !== 'pending') {
    throw new AppError('Pending action already resolved', 400);
  }
  return markPendingActionStatus(actionId, 'rejected', {
    resolvedBy: options.resolvedBy ?? null,
  });
}

export function ensureColumnsForProject(projectId: number, columnNames: string[]): Column[] {
  const insertColumn = db.prepare(`
    INSERT OR IGNORE INTO columns (project_id, name, order_index)
    VALUES (@projectId, @name, @orderIndex)
  `);

  columnNames.forEach((name, index) => {
    insertColumn.run({
      projectId,
      name,
      orderIndex: index,
    });
  });

  return getColumns(projectId);
}

export function getColumns(projectId: number): Column[] {
  const rows = columnSelectByProject.all(projectId) as ColumnRow[];
  return rows.map(mapColumn);
}

export function getColumnById(columnId: number): Column | undefined {
  const row = columnSelectById.get(columnId) as ColumnRow | undefined;
  return row ? mapColumn(row) : undefined;
}

export function getColumnByName(projectId: number, columnName: string): Column | undefined {
  const row = columnSelectByName.get(projectId, columnName) as ColumnRow | undefined;
  return row ? mapColumn(row) : undefined;
}

export function listEpics(projectId: number): Epic[] {
  const rows = epicSelectByProject.all(projectId) as EpicRow[];
  return rows.map(mapEpic);
}

export function getEpicById(epicId: number): Epic | undefined {
  const row = epicSelectById.get(epicId) as EpicRow | undefined;
  return row ? mapEpic(row) : undefined;
}

export function getEpicByName(projectId: number, epicName: string): Epic | undefined {
  const row = epicSelectByName.get(projectId, epicName) as EpicRow | undefined;
  return row ? mapEpic(row) : undefined;
}

export function createEpic(projectId: number, data: { name: string; description?: string | null; color?: string | null }): Epic {
  const normalizedName = normalizeEpicName(data.name);
  if (normalizedName.length === 0) {
    throw new AppError('Epic name is required', 400);
  }

  const existingWithName = getEpicByName(projectId, normalizedName);
  if (existingWithName) {
    throw new AppError(`An epic named "${normalizedName}" already exists in this project.`, 409);
  }

  try {
    const info = epicInsert.run({
      projectId,
      name: normalizedName,
      description: normalizeOptionalDescription(data.description ?? null),
      color: normalizeOptionalColor(data.color ?? null),
    });

    const epic = getEpicById(Number(info.lastInsertRowid));
    if (!epic) {
      throw new AppError('Failed to create epic', 500);
    }
    return epic;
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === 'SQLITE_CONSTRAINT_UNIQUE') {
      throw new AppError(`An epic named "${normalizedName}" already exists in this project.`, 409);
    }
    throw error;
  }
}

export function updateEpic(epicId: number, data: { name?: string; description?: string | null; color?: string | null }): Epic {
  const existing = getEpicById(epicId);
  if (!existing) {
    throw new Error('Epic not found');
  }

  const normalizedName = data.name !== undefined ? normalizeEpicName(data.name) : undefined;
  if (normalizedName !== undefined && normalizedName.length === 0) {
    throw new AppError('Epic name is required', 400);
  }

  if (normalizedName) {
    const duplicate = getEpicByName(existing.projectId, normalizedName);
    if (duplicate && duplicate.id !== epicId) {
      throw new AppError(`An epic named "${normalizedName}" already exists in this project.`, 409);
    }
  }

  epicUpdateStmt.run({
    id: epicId,
    name: normalizedName ?? null,
    description: data.description === undefined ? null : normalizeOptionalDescription(data.description),
    descriptionSentinel: data.description !== undefined ? 1 : 0,
    color: data.color === undefined ? null : normalizeOptionalColor(data.color),
    colorSentinel: data.color !== undefined ? 1 : 0,
  });

  return getEpicById(epicId)!;
}

export function deleteEpic(epicId: number): void {
  epicDeleteStmt.run(epicId);
}

export function createColumn(projectId: number, data: { name: string; orderIndex?: number }): Column {
  const columns = getColumns(projectId);
  const orderIndex = data.orderIndex ?? (columns.length > 0 ? Math.max(...columns.map((c) => c.orderIndex)) + 1 : 0);

  const insertColumn = db.prepare(`
    INSERT INTO columns (project_id, name, order_index)
    VALUES (@projectId, @name, @orderIndex)
  `);

  const info = insertColumn.run({
    projectId,
    name: data.name,
    orderIndex,
  });

  const column = getColumnById(Number(info.lastInsertRowid));
  if (!column) {
    throw new Error('Failed to create column');
  }

  return column;
}

export function updateColumn(columnId: number, data: { name?: string; orderIndex?: number; wipLimit?: number | null }): Column {
  const column = getColumnById(columnId);
  if (!column) {
    throw new Error('Column not found');
  }

  const update = db.prepare(`
    UPDATE columns
    SET
      name = COALESCE(@name, name),
      order_index = COALESCE(@orderIndex, order_index),
      wip_limit = @wipLimit,
      updated_at = datetime('now')
    WHERE id = @id
  `);

  update.run({
    id: columnId,
    name: data.name ?? null,
    orderIndex: data.orderIndex ?? null,
    wipLimit: data.wipLimit === undefined ? column.wipLimit : data.wipLimit,
  });

  return getColumnById(columnId)!;
}

export function deleteColumn(columnId: number): void {
  const del = db.prepare(`DELETE FROM columns WHERE id = ?`);
  del.run(columnId);
}

export function listTickets(projectId: number): Ticket[] {
  const rows = ticketSelectByProject.all(projectId) as TicketRow[];
  return rows.map(mapTicket);
}

export function getTicketById(ticketId: number): Ticket | undefined {
  const row = ticketSelectById.get(ticketId) as TicketRow | undefined;
  return row ? mapTicket(row) : undefined;
}

export function getTicketBatchById(batchId: string): TicketBatch | undefined {
  const row = ticketBatchSelectByIdStmt.get(batchId) as TicketBatchRow | undefined;
  if (!row) {
    return undefined;
  }
  const itemRows = ticketBatchItemsByBatchStmt.all(batchId) as TicketBatchItemRow[];
  return mapTicketBatch(row, itemRows.map(mapTicketBatchItem));
}

export function upsertTicketBatch(data: {
  id: string;
  projectId: number;
  status?: string;
  traceId?: string | null;
  threadId?: string | null;
  planningPayload?: Record<string, unknown> | null;
}): TicketBatch {
  const existing = getTicketBatchById(data.id);
  if (!existing) {
    ticketBatchInsertStmt.run({
      id: data.id,
      projectId: data.projectId,
      status: data.status ?? 'planned',
      traceId: data.traceId ?? null,
      threadId: data.threadId ?? null,
      planningPayload: serializeJsonValue(data.planningPayload ?? null),
    });
  } else {
    ticketBatchUpdateStmt.run({
      id: data.id,
      status: data.status ?? null,
      traceId: data.traceId ?? null,
      threadId: data.threadId ?? null,
      planningPayload: data.planningPayload === undefined ? null : serializeJsonValue(data.planningPayload),
    });
  }
  const batch = getTicketBatchById(data.id);
  if (!batch) {
    throw new Error('Failed to upsert ticket batch');
  }
  return batch;
}

export function upsertTicketBatchItem(data: {
  batchId: string;
  ticketId: number;
  waveIndex: number;
  orderIndex: number;
  planningState?: string | null;
  blockedByTicketId?: number | null;
}): TicketBatchItem {
  ticketBatchItemUpsertStmt.run({
    batchId: data.batchId,
    ticketId: data.ticketId,
    waveIndex: data.waveIndex,
    orderIndex: data.orderIndex,
    planningState: data.planningState ?? null,
    blockedByTicketId: data.blockedByTicketId ?? null,
  });
  const row = ticketBatchItemByBatchTicketStmt.get(data.batchId, data.ticketId) as TicketBatchItemRow | undefined;
  if (!row) {
    throw new Error('Failed to upsert ticket batch item');
  }
  return mapTicketBatchItem(row);
}

function normalizeLeaseTtlSeconds(ttlSeconds: number): number {
  if (!Number.isFinite(ttlSeconds)) {
    throw new AppError('Lease TTL must be a finite number.', 400);
  }
  return Math.max(1, Math.min(3600, Math.floor(ttlSeconds)));
}

export function getStagingLease(projectId: number, now = new Date()): StagingLease | null {
  const row = stagingLeaseSelectStmt.get(projectId) as StagingLeaseRow | undefined;
  return row ? mapStagingLease(row, now) : null;
}

const acquireStagingLeaseTransaction = db.transaction((data: {
  projectId: number;
  ownerId: string;
  ticketId: number;
  runId?: number | null;
  candidateRef: string;
  baselineRef: string;
  ttlSeconds: number;
  now: Date;
}): StagingLeaseAcquireResult => {
  const current = stagingLeaseSelectStmt.get(data.projectId) as StagingLeaseRow | undefined;
  if (current && isLeaseActive(current, data.now)) {
    const remainingMilliseconds = Math.max(0, Date.parse(current.expires_at!) - data.now.getTime());
    return {
      acquired: false,
      lease: mapStagingLease(current, data.now),
      leaseToken: null,
      retryAfterSeconds: Math.max(1, Math.ceil(remainingMilliseconds / 1000)),
    };
  }

  const ttlSeconds = normalizeLeaseTtlSeconds(data.ttlSeconds);
  const nowIso = data.now.toISOString();
  const expiresAt = new Date(data.now.getTime() + ttlSeconds * 1000).toISOString();
  const leaseToken = randomUUID();
  const fencingToken = (current?.fencing_token ?? 0) + 1;

  stagingLeaseUpsertStmt.run({
    projectId: data.projectId,
    ownerId: data.ownerId,
    ticketId: data.ticketId,
    runId: data.runId ?? null,
    candidateRef: data.candidateRef,
    baselineRef: data.baselineRef,
    leaseToken,
    fencingToken,
    now: nowIso,
    expiresAt,
  });

  const acquired = stagingLeaseSelectStmt.get(data.projectId) as StagingLeaseRow;
  return {
    acquired: true,
    lease: mapStagingLease(acquired, data.now),
    leaseToken,
    retryAfterSeconds: null,
  };
});

export function acquireStagingLease(data: {
  projectId: number;
  ownerId: string;
  ticketId: number;
  runId?: number | null;
  candidateRef: string;
  baselineRef: string;
  ttlSeconds?: number;
  now?: Date;
}): StagingLeaseAcquireResult {
  return acquireStagingLeaseTransaction.immediate({
    ...data,
    ttlSeconds: data.ttlSeconds ?? 1200,
    now: data.now ?? new Date(),
  });
}

function checkStagingLeaseHolder(data: {
  projectId: number;
  leaseToken: string;
  fencingToken: number;
  now: Date;
}): StagingLeaseMutationResult {
  const row = stagingLeaseSelectStmt.get(data.projectId) as StagingLeaseRow | undefined;
  if (!row || !row.lease_token) {
    return { success: false, lease: row ? mapStagingLease(row, data.now) : null, reason: 'not_found' };
  }
  if (row.lease_token !== data.leaseToken || row.fencing_token !== data.fencingToken) {
    return { success: false, lease: mapStagingLease(row, data.now), reason: 'not_holder' };
  }
  if (!isLeaseActive(row, data.now)) {
    return { success: false, lease: mapStagingLease(row, data.now), reason: 'expired' };
  }
  return { success: true, lease: mapStagingLease(row, data.now), reason: null };
}

export function assertStagingLease(data: {
  projectId: number;
  leaseToken: string;
  fencingToken: number;
  now?: Date;
}): StagingLeaseMutationResult {
  return checkStagingLeaseHolder({ ...data, now: data.now ?? new Date() });
}

const heartbeatStagingLeaseTransaction = db.transaction((data: {
  projectId: number;
  leaseToken: string;
  fencingToken: number;
  ttlSeconds: number;
  now: Date;
}): StagingLeaseMutationResult => {
  const ownership = checkStagingLeaseHolder(data);
  if (!ownership.success) {
    return ownership;
  }
  const ttlSeconds = normalizeLeaseTtlSeconds(data.ttlSeconds);
  const nowIso = data.now.toISOString();
  const expiresAt = new Date(data.now.getTime() + ttlSeconds * 1000).toISOString();
  stagingLeaseHeartbeatStmt.run({
    projectId: data.projectId,
    leaseToken: data.leaseToken,
    fencingToken: data.fencingToken,
    now: nowIso,
    expiresAt,
  });
  const row = stagingLeaseSelectStmt.get(data.projectId) as StagingLeaseRow;
  return { success: true, lease: mapStagingLease(row, data.now), reason: null };
});

export function heartbeatStagingLease(data: {
  projectId: number;
  leaseToken: string;
  fencingToken: number;
  ttlSeconds?: number;
  now?: Date;
}): StagingLeaseMutationResult {
  return heartbeatStagingLeaseTransaction.immediate({
    ...data,
    ttlSeconds: data.ttlSeconds ?? 1200,
    now: data.now ?? new Date(),
  });
}

const releaseStagingLeaseTransaction = db.transaction((data: {
  projectId: number;
  leaseToken: string;
  fencingToken: number;
  now: Date;
}): StagingLeaseMutationResult => {
  const row = stagingLeaseSelectStmt.get(data.projectId) as StagingLeaseRow | undefined;
  if (!row || !row.lease_token) {
    return { success: false, lease: row ? mapStagingLease(row, data.now) : null, reason: 'not_found' };
  }
  if (row.lease_token !== data.leaseToken || row.fencing_token !== data.fencingToken) {
    return { success: false, lease: mapStagingLease(row, data.now), reason: 'not_holder' };
  }
  stagingLeaseReleaseStmt.run({
    projectId: data.projectId,
    leaseToken: data.leaseToken,
    fencingToken: data.fencingToken,
    now: data.now.toISOString(),
  });
  const released = stagingLeaseSelectStmt.get(data.projectId) as StagingLeaseRow;
  return { success: true, lease: mapStagingLease(released, data.now), reason: null };
});

export function releaseStagingLease(data: {
  projectId: number;
  leaseToken: string;
  fencingToken: number;
  now?: Date;
}): StagingLeaseMutationResult {
  return releaseStagingLeaseTransaction.immediate({ ...data, now: data.now ?? new Date() });
}

export function listTicketRuns(ticketId: number): TicketRun[] {
  const rows = ticketRunsByTicketStmt.all(ticketId) as TicketRunRow[];
  return rows.map(mapTicketRun);
}

export function getTicketRunById(runId: number): TicketRun | undefined {
  const row = ticketRunSelectByIdStmt.get(runId) as TicketRunRow | undefined;
  return row ? mapTicketRun(row) : undefined;
}

export function getTicketRunByHandoffId(handoffId: string): TicketRun | undefined {
  const row = ticketRunSelectByHandoffStmt.get(handoffId) as TicketRunRow | undefined;
  return row ? mapTicketRun(row) : undefined;
}

export function getLatestTicketRunByTicketId(ticketId: number): TicketRun | null {
  return getLatestTicketRunByTicketIdInternal(ticketId);
}

export function createTicketRun(data: {
  ticketId: number;
  batchId?: string | null;
  batchItemId?: number | null;
  handoffId: string;
  threadId?: string | null;
  executorBackend?: string | null;
  runStatus: TicketRunStatus;
  resumeState?: TicketResumeState | null;
  bundlePresent?: boolean;
  patchApplied?: boolean;
  deployUrl?: string | null;
  terminalReason?: string | null;
  promptId?: string | null;
  promptVersion?: string | null;
  promptManifestVersion?: string | null;
  runtimeCommitSha?: string | null;
  validationRequired?: boolean;
  validationChecks?: Record<string, unknown>[] | null;
  startedAt?: string | null;
  completedAt?: string | null;
}): TicketRun {
  const ticket = getTicketById(data.ticketId);
  if (!ticket) {
    throw new Error('Ticket not found');
  }
  ticketRunInsertStmt.run({
    ticketId: data.ticketId,
    batchId: data.batchId ?? null,
    batchItemId: data.batchItemId ?? null,
    handoffId: data.handoffId,
    threadId: data.threadId ?? null,
    executorBackend: data.executorBackend ?? null,
    runStatus: data.runStatus,
    resumeState: data.resumeState ?? null,
    bundlePresent: data.bundlePresent ? 1 : 0,
    patchApplied: data.patchApplied ? 1 : 0,
    deployUrl: data.deployUrl ?? null,
    terminalReason: data.terminalReason ?? null,
    promptId: data.promptId ?? null,
    promptVersion: data.promptVersion ?? null,
    promptManifestVersion: data.promptManifestVersion ?? null,
    runtimeCommitSha: data.runtimeCommitSha ?? null,
    validationRequired: data.validationRequired ? 1 : 0,
    validationChecks: serializeJsonValue(data.validationChecks ?? null),
    startedAt: data.startedAt ?? null,
    completedAt: data.completedAt ?? null,
  });
  const created = getTicketRunByHandoffId(data.handoffId);
  if (!created) {
    throw new Error('Failed to create ticket run');
  }
  return created;
}

export function updateTicketRun(runId: number, data: {
  batchId?: string | null;
  batchItemId?: number | null;
  threadId?: string | null;
  executorBackend?: string | null;
  runStatus?: TicketRunStatus | null;
  resumeState?: TicketResumeState | null;
  bundlePresent?: boolean;
  patchApplied?: boolean;
  deployUrl?: string | null;
  terminalReason?: string | null;
  promptId?: string | null;
  promptVersion?: string | null;
  promptManifestVersion?: string | null;
  runtimeCommitSha?: string | null;
  validationRequired?: boolean;
  validationChecks?: Record<string, unknown>[] | null;
  startedAt?: string | null;
  completedAt?: string | null;
}): TicketRun {
  const existing = getTicketRunById(runId);
  if (!existing) {
    throw new Error('Ticket run not found');
  }
  ticketRunUpdateStmt.run({
    id: runId,
    batchId: data.batchId ?? null,
    batchItemId: data.batchItemId ?? null,
    threadId: data.threadId ?? null,
    executorBackend: data.executorBackend ?? null,
    runStatus: data.runStatus ?? null,
    resumeStateSentinel: Object.prototype.hasOwnProperty.call(data, 'resumeState') ? 1 : 0,
    resumeState: data.resumeState ?? null,
    bundlePresent: data.bundlePresent === undefined ? null : (data.bundlePresent ? 1 : 0),
    patchApplied: data.patchApplied === undefined ? null : (data.patchApplied ? 1 : 0),
    deployUrlSentinel: Object.prototype.hasOwnProperty.call(data, 'deployUrl') ? 1 : 0,
    deployUrl: data.deployUrl ?? null,
    terminalReasonSentinel: Object.prototype.hasOwnProperty.call(data, 'terminalReason') ? 1 : 0,
    terminalReason: data.terminalReason ?? null,
    promptId: data.promptId ?? null,
    promptVersion: data.promptVersion ?? null,
    promptManifestVersion: data.promptManifestVersion ?? null,
    runtimeCommitSha: data.runtimeCommitSha ?? null,
    validationRequired: data.validationRequired === undefined ? null : (data.validationRequired ? 1 : 0),
    validationChecksSentinel: Object.prototype.hasOwnProperty.call(data, 'validationChecks') ? 1 : 0,
    validationChecks: serializeJsonValue(data.validationChecks ?? null),
    startedAt: data.startedAt ?? null,
    completedAtSentinel: Object.prototype.hasOwnProperty.call(data, 'completedAt') ? 1 : 0,
    completedAt: data.completedAt ?? null,
  });
  return getTicketRunById(runId)!;
}

export function listTicketRunEvents(runId: number): TicketRunEvent[] {
  const rows = ticketRunEventsByRunStmt.all(runId) as TicketRunEventRow[];
  return rows.map(mapTicketRunEvent);
}

export function addTicketRunEvent(runId: number, data: {
  eventType: string;
  message?: string | null;
  payload?: Record<string, unknown> | null;
}): TicketRunEvent {
  ticketRunEventInsertStmt.run({
    runId,
    eventType: data.eventType,
    message: data.message ?? null,
    payloadJson: serializeJsonValue(data.payload ?? null),
  });
  const events = listTicketRunEvents(runId);
  return events[events.length - 1];
}

export function listTicketRunArtifacts(runId: number): TicketRunArtifact[] {
  const rows = ticketRunArtifactsByRunStmt.all(runId) as TicketRunArtifactRow[];
  return rows.map(mapTicketRunArtifact);
}

export function addTicketRunArtifact(runId: number, data: {
  kind: string;
  label: string;
  url: string;
  mimeType?: string | null;
}): TicketRunArtifact {
  ticketRunArtifactInsertStmt.run({
    runId,
    kind: data.kind,
    label: data.label,
    url: data.url,
    mimeType: data.mimeType ?? null,
  });
  const artifacts = listTicketRunArtifacts(runId);
  return artifacts[artifacts.length - 1];
}

export function listTicketsByPriority(projectId: number, priority: number, columnId?: number): Ticket[] {
  const rows = ticketSelectByProject.all(projectId) as TicketRow[];
  return rows
    .filter((row) => (row.priority ?? 0) === priority && (columnId ? row.column_id === columnId : true))
    .map(mapTicket);
}

export function getTicketComments(ticketId: number): TicketComment[] {
  const rows = ticketCommentsSelectStmt.all(ticketId) as TicketCommentRow[];
  return rows.map(mapTicketComment);
}

export function addTicketComment(ticketId: number, body: string, author?: string | null, fileRefs: string[] = []): TicketComment {
  ticketCommentsInsertStmt.run({
    ticketId,
    author: author ?? null,
    body,
    fileRefs: fileRefs.length > 0 ? JSON.stringify(fileRefs) : null,
  });
  const comments = getTicketComments(ticketId);
  return comments[0];
}

const ALLOWED_DOC_LINK_TYPES = new Set(['references', 'spec', 'design', 'runbook', 'notes']);

function normalizeLinkType(linkType?: string | null): string {
  if (!linkType) {
    return 'references';
  }
  const normalized = linkType.trim().toLowerCase();
  if (normalized.length === 0) {
    return 'references';
  }
  if (ALLOWED_DOC_LINK_TYPES.has(normalized)) {
    return normalized;
  }
  return 'references';
}

export function upsertDocLink(params: {
  projectId: number;
  ticketId: number;
  docPath: string;
  docsProjectId?: string | null;
  linkType?: string | null;
}): DocLink {
  const linkType = normalizeLinkType(params.linkType);
  docLinkUpsertStmt.run({
    projectId: params.projectId,
    ticketId: params.ticketId,
    docPath: params.docPath,
    docsProjectId: params.docsProjectId ?? null,
    linkType,
  });
  const row = docLinkSelectStmt.get(params.projectId, params.ticketId, params.docPath, linkType) as DocLinkRow | undefined;
  if (!row) {
    throw new Error('Failed to upsert doc link');
  }
  return mapDocLink(row);
}

export function listDocLinksForTicket(projectId: number, ticketId: number): DocLink[] {
  const rows = docsLinksByTicketStmt.all(projectId, ticketId) as DocLinkRow[];
  return rows.map(mapDocLink);
}

export function listDocLinksForDoc(projectId: number, docPath: string): DocLink[] {
  const rows = docsLinksByDocStmt.all(projectId, docPath) as DocLinkRow[];
  return rows.map(mapDocLink);
}

export function listAllDocLinks(projectId: number): DocLink[] {
  const rows = docsLinksByProjectStmt.all(projectId) as DocLinkRow[];
  return rows.map(mapDocLink);
}

export function recordIntegrationEvent(params: {
  projectId?: number | null;
  direction: 'incoming' | 'outgoing';
  eventType: string;
  payload?: Record<string, unknown>;
  status?: IntegrationEvent['status'];
}): IntegrationEvent {
  const info = insertIntegrationEventStmt.run({
    projectId: params.projectId ?? null,
    direction: params.direction,
    eventType: params.eventType,
    payload: JSON.stringify(params.payload ?? {}),
    status: params.status ?? 'pending',
  });
  if (params.status === 'processed') {
    markIntegrationEventProcessedStmt.run(Number(info.lastInsertRowid));
  }
  const row = integrationEventSelectByIdStmt.get(Number(info.lastInsertRowid)) as IntegrationEventRow | undefined;
  if (!row) {
    throw new Error('Failed to record integration event');
  }
  return mapIntegrationEvent(row);
}

export function listIntegrationEvents(options: {
  since?: number;
  direction?: 'incoming' | 'outgoing';
  markProcessed?: boolean;
} = {}): IntegrationEvent[] {
  const rows = listIntegrationEventsStmt.all({
    since: options.since ?? 0,
    direction: options.direction ?? null,
  }) as IntegrationEventRow[];
  const events = rows.map(mapIntegrationEvent);
  if (options.markProcessed) {
    events.forEach((event) => {
      if (event.status !== 'processed') {
        markIntegrationEventProcessedStmt.run(event.id);
      }
    });
  }
  return events;
}

export function markIntegrationEventProcessed(id: number): void {
  markIntegrationEventProcessedStmt.run(id);
}

function buildTicketEventPayload(ticket: Ticket): Record<string, unknown> {
  const project = getProjectById(ticket.projectId);
  const column = getColumnById(ticket.columnId);
  return {
    kanbanProjectId: project?.knowledgeProjectId ?? null,
    project: project
      ? {
          id: project.id,
          key: project.key,
          name: project.name,
        }
      : null,
    ticket: {
      id: ticket.id,
      title: ticket.title,
      status: ticket.status,
      columnId: ticket.columnId,
      columnName: column?.name ?? null,
      progressState: ticket.progressState,
      epicId: ticket.epicId,
      estimate: ticket.estimate,
      priority: ticket.priority,
      assignee: null,
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
      completedAt: ticket.completedAt,
    },
  };
}

function emitTicketLifecycleEvent(eventType: string, ticket: Ticket, extra: Record<string, unknown> = {}): void {
  const project = getProjectById(ticket.projectId);
  if (!project) {
    return;
  }
  const payload = {
    ...buildTicketEventPayload(ticket),
    ...extra,
  };
  recordIntegrationEvent({
    projectId: project.id,
    direction: 'outgoing',
    eventType,
    payload,
  });
}

export function createTicket(projectId: number, data: {
  columnId?: number;
  title: string;
  description?: string | null;
  estimate?: number | null;
  epicId?: number | null;
  epicName?: string | null;
  progressState?: Ticket['progressState'];
}): Ticket {
  const columns = getColumns(projectId);
  if (columns.length === 0) {
    throw new Error('Project has no columns');
  }

  let columnId = data.columnId;
  if (columnId === undefined || columnId === null) {
    columnId = columns[0].id;
  } else {
    const columnExists = columns.some((col) => col.id === columnId);
    if (!columnExists) {
      throw new Error('Column does not belong to project');
    }
  }

  const column = getColumnById(columnId);
  if (!column) {
    throw new Error('Column not found');
  }

  let epicId: number | null = data.epicId ?? null;
  if ((epicId === null || epicId === undefined) && data.epicName) {
    const epic = getEpicByName(projectId, data.epicName);
    if (!epic) {
      throw new Error(`Epic ${data.epicName} not found in project`);
    }
    epicId = epic.id;
  }

  if (epicId !== null && epicId !== undefined) {
    const epic = getEpicById(epicId);
    if (!epic || epic.projectId !== projectId) {
      throw new Error('Epic does not belong to the same project');
    }
  }

  const insertTicket = db.prepare(`
    INSERT INTO tickets (project_id, column_id, title, description, estimate, status, progress_state, epic_id, completed_at, priority)
    VALUES (@projectId, @columnId, @title, @description, @estimate, @status, @progressState, @epicId, @completedAt, @priority)
  `);

  const automationSettings = getProjectAutomationSettings(projectId);
  const columnState = getColumnState(automationSettings, column.id);
  const completedAt = columnState === 'done' ? new Date().toISOString() : null;
  const progressState = columnState;
  const maxPriorityRow = ticketMaxPriorityByColumnStmt.get(columnId) as { maxPriority: number | null } | undefined;
  const nextPriority =
    maxPriorityRow && typeof maxPriorityRow.maxPriority === 'number' ? maxPriorityRow.maxPriority + 1 : 0;

  const info = insertTicket.run({
    projectId,
    columnId,
    title: data.title,
    description: data.description ?? null,
    estimate: data.estimate ?? null,
    status: column.name,
    progressState,
    epicId,
    completedAt,
    priority: nextPriority,
  });

  const ticket = getTicketById(Number(info.lastInsertRowid));
  if (!ticket) {
    throw new Error('Failed to create ticket');
  }

  emitTicketLifecycleEvent('ticket.created', ticket);
  return ticket;
}

export function updateTicket(ticketId: number, data: {
  title?: string;
  description?: string | null;
  columnId?: number;
  estimate?: number | null;
  status?: string;
  epicId?: number | null;
  epicName?: string | null;
  priority?: number;
  progressState?: Ticket['progressState'];
  completionSummary?: string | null;
  deploymentProof?: string | null;
  completionEvidence?: CompletionEvidenceItem[] | null;
}): Ticket {
  const ticket = getTicketById(ticketId);
  if (!ticket) {
    throw new Error('Ticket not found');
  }

  let columnId = ticket.columnId;
  let status = ticket.status;
  let epicId = ticket.epicId;
  let priority = ticket.priority;
  const automationSettings = getProjectAutomationSettings(ticket.projectId);
  const previousState = getColumnState(automationSettings, ticket.columnId);
  let progressState: ProgressState = previousState;

  const previousColumn = getColumnById(ticket.columnId);
  let newColumn = previousColumn;

  if (data.columnId !== undefined && data.columnId !== ticket.columnId) {
    const targetColumn = getColumnById(data.columnId);
    if (!targetColumn) {
      throw new Error('Column not found');
    }
    if (targetColumn.projectId !== ticket.projectId) {
      throw new Error('Column does not belong to the same project');
    }
    columnId = targetColumn.id;
    status = targetColumn.name;
    newColumn = targetColumn;
  }

  if (data.status !== undefined) {
    status = data.status;
  }

  if (data.epicId !== undefined) {
    if (data.epicId === null) {
      epicId = null;
    } else {
      const epic = getEpicById(data.epicId);
      if (!epic || epic.projectId !== ticket.projectId) {
        throw new Error('Epic does not belong to the same project');
      }
      epicId = epic.id;
    }
  } else if (data.epicName !== undefined) {
    if (!data.epicName) {
      epicId = null;
    } else {
      const epic = getEpicByName(ticket.projectId, data.epicName);
      if (!epic) {
        throw new Error(`Epic ${data.epicName} not found in project`);
      }
      epicId = epic.id;
    }
  }

  const newState = getColumnState(automationSettings, columnId);
  progressState = newState;
  let completedAt = ticket.completedAt;
  const completionSummary = data.completionSummary === undefined ? ticket.completionSummary : data.completionSummary;
  const deploymentProof = data.deploymentProof === undefined ? ticket.deploymentProof : data.deploymentProof;
  const completionEvidence =
    data.completionEvidence === undefined
      ? ticket.completionEvidence
      : normalizeCompletionEvidenceInput(data.completionEvidence);

  // Check if moving to Done state
  if (newState === 'done' && previousState !== 'done') {
    // Require completion summary when moving to Done
    if (!completionSummary || completionSummary.trim() === '') {
      throw new AppError(
        'Cannot move ticket to Done without a completion summary. Please add a completion summary that includes:\n' +
        '1. What was done - Summary of work completed\n' +
        '2. Future improvements - What could be improved later\n' +
        '3. Separated work - Links to any tickets created from scope that was cut',
        400
      );
    }

    completedAt = new Date().toISOString();
  } else if (newState !== 'done' && previousState === 'done') {
    completedAt = null;
  }

  if (data.priority !== undefined) {
    priority = data.priority;
  } else if (columnId !== ticket.columnId) {
    const maxPriorityRow = ticketMaxPriorityByColumnStmt.get(columnId) as { maxPriority: number | null } | undefined;
    priority = maxPriorityRow && typeof maxPriorityRow.maxPriority === 'number' ? maxPriorityRow.maxPriority + 1 : 0;
  }

  const columnChanged = columnId !== ticket.columnId;

  const update = db.prepare(`
    UPDATE tickets
    SET
      title = COALESCE(@title, title),
      description = @description,
      column_id = @columnId,
      estimate = @estimate,
      status = @status,
      progress_state = @progressState,
      epic_id = @epicId,
      completed_at = @completedAt,
      completion_summary = @completionSummary,
      deployment_proof = @deploymentProof,
      completion_evidence = @completionEvidence,
      priority = COALESCE(@priority, priority),
      updated_at = datetime('now')
    WHERE id = @id
  `);

  update.run({
    id: ticketId,
    title: data.title ?? null,
    description: data.description === undefined ? ticket.description : data.description,
    columnId,
    estimate: data.estimate === undefined ? ticket.estimate : data.estimate,
    status,
    progressState,
    epicId,
    completedAt,
    completionSummary,
    deploymentProof,
    completionEvidence: serializeCompletionEvidence(completionEvidence),
    priority,
  });

  const updatedTicket = getTicketById(ticketId)!;
  const changes: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      changes[key] = value;
    }
  }
  emitTicketLifecycleEvent('ticket.updated', updatedTicket, { changes, previousColumnId: ticket.columnId });
  if (columnChanged) {
    emitTicketLifecycleEvent('ticket.moved', updatedTicket, {
      fromColumnId: ticket.columnId,
      toColumnId: updatedTicket.columnId,
    });
  }
  return updatedTicket;
}

export function deleteTicket(ticketId: number): void {
  const existing = getTicketById(ticketId);
  if (!existing) {
    return;
  }
  const columnId = existing.columnId;
  const projectId = existing.projectId;
  emitTicketLifecycleEvent('ticket.deleted', existing);
  const del = db.prepare(`DELETE FROM tickets WHERE id = ?`);
  del.run(ticketId);
  const remaining = listTickets(projectId).filter((ticket) => ticket.columnId === columnId);
  reorderColumnTickets(columnId, remaining.map((ticket) => ticket.id));
}

export function restoreTicket(data: {
  id: number;
  projectId: number;
  columnId: number;
  title: string;
  description: string | null;
  estimate: number | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  completionSummary?: string | null;
  deploymentProof?: string | null;
  completionEvidence?: CompletionEvidenceItem[] | null;
  epicId: number | null;
  priority?: number | null;
}): Ticket {
  const existing = getTicketById(data.id);
  if (existing) {
    throw new AppError(`Ticket #${data.id} already exists`, 409);
  }

  const project = getProjectById(data.projectId);
  if (!project) {
    throw new AppError('Project not found', 404);
  }

  const column = getColumnById(data.columnId);
  if (!column || column.projectId !== data.projectId) {
    throw new AppError('Column does not belong to this project', 400);
  }

  let epicId: number | null = data.epicId ?? null;
  if (epicId !== null) {
    const epic = getEpicById(epicId);
    if (!epic || epic.projectId !== data.projectId) {
      throw new AppError('Epic does not belong to this project', 400);
    }
  }

  const createdAt = data.createdAt ?? new Date().toISOString();
  const updatedAt = data.updatedAt ?? createdAt;
  const automationSettings = getProjectAutomationSettings(data.projectId);
  const columnState = getColumnState(automationSettings, column.id);
  const progressState = columnState;
  const completedAt = progressState === 'done' ? data.completedAt ?? new Date().toISOString() : null;
  const completionEvidence = normalizeCompletionEvidenceInput(data.completionEvidence);
  let priority =
    data.priority !== undefined && data.priority !== null
      ? data.priority
      : (() => {
          const maxPriorityRow = ticketMaxPriorityByColumnStmt.get(column.id) as { maxPriority: number | null } | undefined;
          return maxPriorityRow && typeof maxPriorityRow.maxPriority === 'number' ? maxPriorityRow.maxPriority + 1 : 0;
        })();

  try {
    ticketRestoreStmt.run({
      id: data.id,
      projectId: data.projectId,
      columnId: column.id,
      title: data.title,
      description: data.description ?? null,
      estimate: data.estimate ?? null,
      status: column.name,
      progressState,
      createdAt,
      updatedAt,
      completedAt,
      completionSummary: data.completionSummary ?? null,
      deploymentProof: data.deploymentProof ?? null,
      completionEvidence: serializeCompletionEvidence(completionEvidence),
      epicId,
      priority,
    });
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === 'SQLITE_CONSTRAINT' || code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
      throw new AppError(`Unable to restore ticket #${data.id} because another record already uses that id.`, 409);
    }
    throw error;
  }

  const restored = getTicketById(data.id)!;
  const sortedTickets = listTickets(data.projectId)
    .filter((ticket) => ticket.columnId === column.id)
    .sort((a, b) => {
      const priorityDiff = (a.priority ?? 0) - (b.priority ?? 0);
      if (priorityDiff !== 0) {
        return priorityDiff;
      }
      return a.id - b.id;
    });
  reorderColumnTickets(column.id, sortedTickets.map((ticket) => ticket.id));

  return restored;
}

export function deleteProject(projectId: number): void {
  const del = db.prepare(`DELETE FROM projects WHERE id = ?`);
  del.run(projectId);
}

export function exportProjectData(projectId: number) {
  const project = getProjectById(projectId);
  if (!project) {
    throw new Error('Project not found');
  }

  const columns = getColumns(projectId);
  const tickets = listTickets(projectId);
  const epics = listEpics(projectId);
  const docLinks = listAllDocLinks(projectId);

  return {
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    project,
    columns,
    tickets,
    epics,
    docLinks,
  };
}

export function getBoardByProjectKey(projectKey: string): Board | undefined {
  const project = getProjectByKey(projectKey);
  if (!project) {
    return undefined;
  }
  const columns = getColumns(project.id);
  const tickets = listTickets(project.id);
  const epics = listEpics(project.id);

  const columnMap = new Map<number, BoardColumn>(
    columns.map((col) => [
      col.id,
      {
        ...col,
        tickets: [],
      },
    ])
  );

  tickets.forEach((ticket) => {
    const bucket = columnMap.get(ticket.columnId);
    if (bucket) {
      bucket.tickets.push(ticket);
    }
  });

  columnMap.forEach((bucket) => {
    bucket.tickets.sort((a, b) => {
      const priorityDiff = (a.priority ?? 0) - (b.priority ?? 0);
      if (priorityDiff !== 0) {
        return priorityDiff;
      }
      return a.id - b.id;
    });
  });

  const orderedColumns = columns.map((col) => columnMap.get(col.id)!);

  const automation = normalizeAutomationSettings(project.id, project.automationSettings ?? null, columns);
  if (!project.automationSettings) {
    setProjectAutomationSettings(project.id, automation);
    project.automationSettings = automation;
  }

  return {
    project,
    columns: orderedColumns,
    epics,
    automation,
  };
}

export function getBoardByProjectId(projectId: number): Board | undefined {
  const project = getProjectById(projectId);
  if (!project) {
    return undefined;
  }
  const columns = getColumns(projectId);
  const tickets = listTickets(projectId);
  const epics = listEpics(projectId);

  const columnMap = new Map<number, BoardColumn>(
    columns.map((col) => [
      col.id,
      {
        ...col,
        tickets: [],
      },
    ])
  );

  tickets.forEach((ticket) => {
    const bucket = columnMap.get(ticket.columnId);
    if (bucket) {
      bucket.tickets.push(ticket);
    }
  });

  columnMap.forEach((bucket) => {
    bucket.tickets.sort((a, b) => {
      const priorityDiff = (a.priority ?? 0) - (b.priority ?? 0);
      if (priorityDiff !== 0) {
        return priorityDiff;
      }
      return a.id - b.id;
    });
  });

  const orderedColumns = columns.map((col) => columnMap.get(col.id)!);

  const automation = normalizeAutomationSettings(projectId, project.automationSettings ?? null, columns);
  if (!project.automationSettings) {
    setProjectAutomationSettings(projectId, automation);
    project.automationSettings = automation;
  }

  return {
    project,
    columns: orderedColumns,
    epics,
    automation,
  };
}

export function moveTicket(
  ticketId: number,
  targetColumnId: number,
  options: {
    priority?: number;
    completionSummary?: string | null;
    deploymentProof?: string | null;
    completionEvidence?: CompletionEvidenceItem[] | null;
  } = {}
): Ticket {
  return updateTicket(ticketId, {
    columnId: targetColumnId,
    priority: options.priority,
    completionSummary: options.completionSummary,
    deploymentProof: options.deploymentProof,
    completionEvidence: options.completionEvidence,
  });
}

export function reorderColumnTickets(columnId: number, orderedTicketIds: number[]): void {
  const column = getColumnById(columnId);
  if (!column) {
    throw new AppError('Column not found', 404);
  }

  const uniqueOrdered = Array.from(new Set(orderedTicketIds.filter((id) => Number.isFinite(id)))).map(Number);

  const columnTickets = listTickets(column.projectId).filter((ticket) => ticket.columnId === columnId);
  const existingIds = columnTickets.map((ticket) => ticket.id);
  const remainingIds = existingIds.filter((id) => !uniqueOrdered.includes(id));
  const finalOrder = uniqueOrdered.concat(remainingIds);

  const automationSettings = getProjectAutomationSettings(column.projectId);

  const txn = db.transaction((ids: number[]) => {
    ids.forEach((ticketId, index) => {
      const ticket = getTicketById(ticketId);
      if (!ticket) {
        return;
      }
      const previousState = getColumnState(automationSettings, ticket.columnId);
      const newState = getColumnState(automationSettings, column.id);
      let completedAt = ticket.completedAt;
      if (newState === 'done' && previousState !== 'done') {
        completedAt = new Date().toISOString();
      } else if (newState !== 'done' && previousState === 'done') {
        completedAt = null;
      }

      ticketPriorityUpdateStmt.run({
        id: ticketId,
        columnId: column.id,
        status: column.name,
        progressState: newState,
        priority: index,
        completedAt,
      });
    });
  });

  txn(finalOrder);
}

export function setTicketEstimate(ticketId: number, estimate: number | null): Ticket {
  return updateTicket(ticketId, { estimate });
}

function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getLastNDays(days: number): string[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const output: string[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    output.push(formatDateKey(d));
  }
  return output;
}

function getWeekKey(date: Date): string {
  const result = weekKeyStmt.get(formatDateKey(date)) as { week: string | null } | undefined;
  return result?.week ?? formatDateKey(date);
}

function getRecentWeeks(count: number): string[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const day = today.getDay();
  const diffToMonday = (day + 6) % 7;
  const monday = new Date(today);
  monday.setDate(today.getDate() - diffToMonday);

  const weeks: string[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const start = new Date(monday);
    start.setDate(monday.getDate() - i * 7);
    const key = getWeekKey(start);
    weeks.push(key);
  }
  return weeks;
}

export function getProjectMetrics(projectId: number): ProjectMetrics {
  const dayWindow = 21;
  const weekWindow = 6;
  const dates = getLastNDays(dayWindow);

  const createdRows = ticketCreatedCountsStmt.all(projectId) as { day: string | null; total: number }[];
  const completedRows = ticketCompletedCountsStmt.all(projectId) as { day: string | null; total: number }[];

  const createdMap = new Map<string, number>();
  createdRows.forEach((row) => {
    if (row.day) {
      createdMap.set(row.day, Number(row.total));
    }
  });

  const completedMap = new Map<string, number>();
  completedRows.forEach((row) => {
    if (row.day) {
      completedMap.set(row.day, Number(row.total));
    }
  });

  let scope = 0;
  let done = 0;
  const scopeSeries: number[] = [];
  const completedSeries: number[] = [];
  const remainingSeries: number[] = [];

  dates.forEach((dayKey) => {
    scope += createdMap.get(dayKey) ?? 0;
    done += completedMap.get(dayKey) ?? 0;
    scopeSeries.push(scope);
    completedSeries.push(done);
    remainingSeries.push(Math.max(scope - done, 0));
  });

  const velocityRows = velocityPointsStmt.all(projectId) as { week: string | null; points: number | null }[];
  const velocityMap = new Map<string, number>();
  velocityRows.forEach((row) => {
    if (row.week) {
      velocityMap.set(row.week, Number(row.points ?? 0));
    }
  });

  let weeks = getRecentWeeks(weekWindow);
  if (weeks.length === 0) {
    weeks = [getWeekKey(new Date())];
  }

  const pointsSeries = weeks.map((week) => velocityMap.get(week) ?? 0);
  const totalPoints = pointsSeries.reduce((sum, val) => sum + val, 0);
  const weeksWithData = pointsSeries.filter((val) => val > 0).length;
  const average = weeksWithData > 0 ? totalPoints / weeksWithData : 0;

  return {
    burnup: {
      dates,
      scope: scopeSeries,
      completed: completedSeries,
    },
    burndown: {
      dates,
      remaining: remainingSeries,
    },
    velocity: {
      weeks,
      points: pointsSeries,
      average: Number(average.toFixed(2)),
    },
  };
}
