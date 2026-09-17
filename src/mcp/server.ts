import type { McpServer as McpServerType } from '@modelcontextprotocol/sdk/server/mcp';
import type { StdioServerTransport as StdioServerTransportType } from '@modelcontextprotocol/sdk/server/stdio';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { z } from 'zod/v3';

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js') as {
  McpServer: typeof McpServerType;
};
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js') as {
  StdioServerTransport: typeof StdioServerTransportType;
};
import {
  DEFAULT_SCRUM_VALUES,
  createColumn,
  createProject,
  createTicket,
  deleteColumn,
  deleteTicket,
  getBoardByProjectKey,
  getColumnById,
  getColumnByName,
  getEpicById,
  getEpicByName,
  getProjectById,
  getProjectByKey,
  getTicketById,
  getProjectMetrics,
  listProjects,
  listTickets,
  createEpic,
  listEpics,
  moveTicket,
  reorderColumnTickets,
  updateEpic,
  deleteEpic,
  setTicketEstimate,
  updateColumn,
  updateTicket,
  upsertDocLink,
  listDocLinksForTicket,
  listDocLinksForDoc,
  getProjectByKnowledgeId,
  setProjectKnowledgeId,
  getLatestTicketRunByTicketId,
  getTicketBatchById,
  getTicketRunById,
  listTicketRunArtifacts,
  listTicketRunEvents,
  listTicketRuns,
  acquireStagingLease,
  assertStagingLease,
  getStagingLease,
  heartbeatStagingLease,
  releaseStagingLease,
} from '../dataStore';
import {
  projectSchema,
  boardSchema,
  ticketSchema,
  completionEvidenceItemSchema,
  columnSchema,
  epicSchema,
  automationSettingsSchema,
  copilotPendingActionSchema,
  docLinkSchema,
  ticketBatchSchema,
  ticketRunArtifactSchema,
  ticketRunEventSchema,
  ticketRunSchema,
  stagingLeaseSchema,
} from '../types.zod';

type ObjectSchema = z.ZodObject<any>;
const ProjectSchema: ObjectSchema = projectSchema;
const ColumnSchema: ObjectSchema = columnSchema;
const EpicSchema: ObjectSchema = epicSchema;
const TicketSchema: ObjectSchema = ticketSchema;
const DocLinkSchema: ObjectSchema = docLinkSchema;
const AutomationSettingsSchema: ObjectSchema = automationSettingsSchema;
const TicketRunSchema: ObjectSchema = ticketRunSchema;
const TicketRunEventSchema: ObjectSchema = ticketRunEventSchema;
const TicketRunArtifactSchema: ObjectSchema = ticketRunArtifactSchema;
const TicketBatchSchema: ObjectSchema = ticketBatchSchema;
const StagingLeaseSchema: ObjectSchema = stagingLeaseSchema;

const DocLinkWithTicketSchema: ObjectSchema = docLinkSchema.extend({
  ticket: ticketSchema.nullable(),
});

const BoardColumnSchema: ObjectSchema = columnSchema.extend({
  tickets: z.array(ticketSchema),
});

const BoardSchema: ObjectSchema = boardSchema;

const TicketLookupSchema: ObjectSchema = z.object({
  ticket: ticketSchema,
  column: columnSchema,
  project: projectSchema,
  epic: epicSchema.nullable(),
  priorityLabel: z.string(),
  currentRun: ticketRunSchema.nullable(),
});

const TicketSearchFilterSchema: ObjectSchema = z.object({
  priorities: z.array(z.number().int().min(0)).nullable(),
  priorityMin: z.number().int().min(0).nullable(),
  priorityMax: z.number().int().min(0).nullable(),
  limit: z.number().int().min(1).nullable(),
});

const TicketSearchResultSchema: ObjectSchema = z.object({
  project: ProjectSchema,
  column: ColumnSchema,
  filters: TicketSearchFilterSchema,
  count: z.number().int().min(0),
  ticketIds: z.array(z.number().int().positive()),
  tickets: z.array(TicketSchema),
});

const TicketQueryFilterSchema: ObjectSchema = z.object({
  query: z.string().nullable(),
  columnId: z.number().int().positive().nullable(),
  columnName: z.string().nullable(),
  priorities: z.array(z.number().int().min(0)).nullable(),
  priorityMin: z.number().int().min(0).nullable(),
  priorityMax: z.number().int().min(0).nullable(),
  limit: z.number().int().min(1).nullable(),
  offset: z.number().int().min(0).nullable(),
});

const TicketQueryResultSchema: ObjectSchema = z.object({
  project: ProjectSchema,
  column: ColumnSchema.nullable(),
  filters: TicketQueryFilterSchema,
  count: z.number().int().min(0),
  total: z.number().int().min(0),
  offset: z.number().int().min(0),
  limit: z.number().int().min(1),
  hasMore: z.boolean(),
  ticketIds: z.array(z.number().int().positive()),
  tickets: z.array(TicketSchema),
});


const ProjectMetricsSchema: ObjectSchema = z.object({
  burnup: z.object({
    dates: z.array(z.string()),
    scope: z.array(z.number()),
    completed: z.array(z.number()),
  }),
  burndown: z.object({
    dates: z.array(z.string()),
    remaining: z.array(z.number()),
  }),
  velocity: z.object({
    weeks: z.array(z.string()),
    points: z.array(z.number()),
    average: z.number(),
  }),
});

const SuccessShape = {
  success: z.literal(true),
};

const SuccessSchema: ObjectSchema = z.object(SuccessShape);

const hexColorRegex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

// Singleton lock removed to allow multiple MCP client instances
// Database now uses WAL mode for safe concurrent access

const respond = <T extends Record<string, unknown>>(output: T): CallToolResult => ({
  content: [
    {
      type: 'text',
      text: JSON.stringify(output, null, 2),
    },
  ],
  structuredContent: output,
});

const scrumEstimateValue = z
  .number()
  .refine((value) => DEFAULT_SCRUM_VALUES.includes(value), {
    message: `Estimate must be one of ${DEFAULT_SCRUM_VALUES.join(', ')}`,
  });

const server = new McpServer(
  {
    name: 'kanban-project-hub',
    version: '1.0.0',
  },
  {
    instructions: [
      'This server manages Kanban-style projects stored locally.',
      'Use list_projects to discover project keys.',
      'Call get_board with a projectKey to inspect columns and ticket IDs.',
      'Use ticket tools with ticketId values from the board response.',
      'Use kanban_find_ticket for direct lookup by ticket id.',
      'Use kanban_find_column_tickets to slice a column by priority (e.g. priorities 0-2 in “Next”).',
      'Use kanban_column_top_ticket when you only need the highest-priority ticket from a column.',
      'Before changing a shared staging alias, applying a staging migration, mutating shared staging fixtures, or recording staging UAT, acquire the project staging lease. Assert it immediately before each shared mutation, heartbeat it during UAT, and release it after acceptance or rollback.',
      'Manage epics with create/update/delete epic tools to tag related tickets.',
      'Ticket priority is determined by vertical order (0 at top); use kanban_reorder_column_tickets to update it.',
      `Scrum estimates must be one of: ${DEFAULT_SCRUM_VALUES.join(', ')}`,
    ].join('\n'),
  }
);

server.registerTool(
  'kanban_list_projects',
  {
    title: 'List Projects',
    description: 'List available projects',
    outputSchema: {
      projects: z.array(ProjectSchema),
    },
  },
  async () => {
    const projects = listProjects();
    return respond({ projects });
  }
);

server.registerTool(
  'kanban_get_board',
  {
    title: 'Get Board',
    description: 'Fetch the full board for a project, including columns and tickets. All tickets include completionSummary field (populated for completed tickets).',
    inputSchema: {
      projectKey: z.string().describe('Project key identifier'),
    },
    outputSchema: {
      board: BoardSchema,
      scrumValues: z.array(z.number()),
    },
  },
  async ({ projectKey }) => {
    const board = getBoardByProjectKey(projectKey);
    if (!board) {
      throw new Error(`Project ${projectKey} not found`);
    }
    return respond({ board, scrumValues: DEFAULT_SCRUM_VALUES });
  }
);

server.registerTool(
  'kanban_find_ticket',
  {
    title: 'Find Ticket by ID',
    description: 'Look up a single ticket with project, column, and epic context. Returns full ticket details including completionSummary for completed tickets.',
    inputSchema: {
      ticketId: z.number().int().positive(),
    },
    outputSchema: {
      result: TicketLookupSchema,
    },
  },
  async ({ ticketId }) => {
    const ticket = getTicketById(ticketId);
    if (!ticket) {
      throw new Error(`Ticket ${ticketId} not found`);
    }
    const project = getProjectById(ticket.projectId);
    if (!project) {
      throw new Error(`Project ${ticket.projectId} not found for ticket ${ticketId}`);
    }
    const column = getColumnById(ticket.columnId);
    if (!column) {
      throw new Error(`Column ${ticket.columnId} not found for ticket ${ticketId}`);
    }
    const epic = ticket.epicId ? getEpicById(ticket.epicId) ?? null : null;
    const priorityLabel = `P${ticket.priority}`;
    const currentRun = getLatestTicketRunByTicketId(ticket.id);

    return respond({
      result: {
        ticket,
        project,
        column,
        epic,
        priorityLabel,
        currentRun,
      },
    });
  }
);

server.registerTool(
  'kanban_get_ticket_runs',
  {
    title: 'Get Ticket Runs',
    description: 'Fetch append-only run history for a ticket, including events and artifacts for each run.',
    inputSchema: {
      ticketId: z.number().int().positive(),
    },
    outputSchema: {
      ticketId: z.number().int().positive(),
      runs: z.array(
        z.object({
          run: TicketRunSchema,
          events: z.array(TicketRunEventSchema),
          artifacts: z.array(TicketRunArtifactSchema),
        })
      ),
    },
  },
  async ({ ticketId }) => {
    const ticket = getTicketById(ticketId);
    if (!ticket) {
      throw new Error(`Ticket ${ticketId} not found`);
    }
    const runs = listTicketRuns(ticketId).map((run) => ({
      run,
      events: listTicketRunEvents(run.id),
      artifacts: listTicketRunArtifacts(run.id),
    }));
    return respond({ ticketId, runs });
  }
);

server.registerTool(
  'kanban_get_batch',
  {
    title: 'Get Batch',
    description: 'Fetch a Kanban batch with its planned ticket items.',
    inputSchema: {
      batchId: z.string().min(1),
    },
    outputSchema: {
      batch: TicketBatchSchema,
    },
  },
  async ({ batchId }) => {
    const batch = getTicketBatchById(batchId);
    if (!batch) {
      throw new Error(`Batch ${batchId} not found`);
    }
    return respond({ batch });
  }
);

const StagingLeaseMutationOutput = {
  success: z.boolean(),
  lease: StagingLeaseSchema.nullable(),
  reason: z.union([
    z.literal('not_found'),
    z.literal('not_holder'),
    z.literal('expired'),
  ]).nullable(),
};

const stagingLeaseHolderInput = {
  projectKey: z.string().min(1),
  leaseToken: z.string().uuid().describe('Secret holder token returned only by acquire'),
  fencingToken: z.number().int().positive().describe('Monotonic generation returned by acquire'),
};

function resolveStagingLeaseProject(projectKey: string) {
  const project = getProjectByKey(projectKey);
  if (!project) {
    throw new Error(`Project ${projectKey} not found`);
  }
  return project;
}

function validateStagingLeaseTarget(projectId: number, ticketId: number, runId?: number | null): void {
  const ticket = getTicketById(ticketId);
  if (!ticket) {
    throw new Error(`Ticket ${ticketId} not found`);
  }
  if (ticket.projectId !== projectId) {
    throw new Error(`Ticket ${ticketId} does not belong to this project`);
  }
  if (runId) {
    const run = getTicketRunById(runId);
    if (!run) {
      throw new Error(`Ticket run ${runId} not found`);
    }
    if (run.ticketId !== ticketId) {
      throw new Error(`Ticket run ${runId} does not belong to ticket ${ticketId}`);
    }
  }
}

server.registerTool(
  'kanban_staging_lease_status',
  {
    title: 'Get Staging Lease Status',
    description: 'Inspect the shared staging lease without revealing its secret holder token.',
    inputSchema: {
      projectKey: z.string().min(1),
    },
    outputSchema: {
      lease: StagingLeaseSchema.nullable(),
    },
  },
  async ({ projectKey }) => {
    const project = resolveStagingLeaseProject(projectKey);
    return respond({ lease: getStagingLease(project.id) });
  }
);

server.registerTool(
  'kanban_staging_lease_acquire',
  {
    title: 'Acquire Staging Lease',
    description: 'Atomically acquire the one shared staging lease for a ticket candidate. Build the immutable preview before calling this. If another holder is active, acquired is false and no token is returned.',
    inputSchema: {
      projectKey: z.string().min(1),
      ownerId: z.string().trim().min(1).max(200),
      ticketId: z.number().int().positive(),
      runId: z.number().int().positive().optional().nullable(),
      candidateRef: z.string().trim().min(1).max(1000),
      baselineRef: z.string().trim().min(1).max(1000),
      ttlSeconds: z.number().int().min(60).max(3600).optional(),
    },
    outputSchema: {
      acquired: z.boolean(),
      lease: StagingLeaseSchema,
      leaseToken: z.string().uuid().nullable(),
      retryAfterSeconds: z.number().int().positive().nullable(),
    },
  },
  async ({ projectKey, ...input }) => {
    const project = resolveStagingLeaseProject(projectKey);
    validateStagingLeaseTarget(project.id, input.ticketId, input.runId);
    return respond({ ...acquireStagingLease({ projectId: project.id, ...input }) });
  }
);

server.registerTool(
  'kanban_staging_lease_assert',
  {
    title: 'Assert Staging Lease',
    description: 'Validate the holder token and fencing generation immediately before a staging alias change, migration, shared-fixture mutation, acceptance, or rollback.',
    inputSchema: stagingLeaseHolderInput,
    outputSchema: StagingLeaseMutationOutput,
  },
  async ({ projectKey, leaseToken, fencingToken }) => {
    const project = resolveStagingLeaseProject(projectKey);
    return respond({ ...assertStagingLease({ projectId: project.id, leaseToken, fencingToken }) });
  }
);

server.registerTool(
  'kanban_staging_lease_heartbeat',
  {
    title: 'Heartbeat Staging Lease',
    description: 'Extend an active staging lease while targeted hosted UAT is still running. An expired or superseded holder cannot renew.',
    inputSchema: {
      ...stagingLeaseHolderInput,
      ttlSeconds: z.number().int().min(60).max(3600).optional(),
    },
    outputSchema: StagingLeaseMutationOutput,
  },
  async ({ projectKey, leaseToken, fencingToken, ttlSeconds }) => {
    const project = resolveStagingLeaseProject(projectKey);
    return respond({ ...heartbeatStagingLease({ projectId: project.id, leaseToken, fencingToken, ttlSeconds }) });
  }
);

server.registerTool(
  'kanban_staging_lease_release',
  {
    title: 'Release Staging Lease',
    description: 'Release the staging lease after the candidate is accepted or the previous immutable deployment is restored. A stale fencing generation cannot release a successor lease.',
    inputSchema: stagingLeaseHolderInput,
    outputSchema: StagingLeaseMutationOutput,
  },
  async ({ projectKey, leaseToken, fencingToken }) => {
    const project = resolveStagingLeaseProject(projectKey);
    return respond({ ...releaseStagingLease({ projectId: project.id, leaseToken, fencingToken }) });
  }
);

server.registerTool(
  'kanban_find_column_tickets',
  {
    title: 'Find Tickets in Column',
    description:
      'Filter tickets within a column by priority band. Supply priorities or priorityMin/priorityMax bounds.',
    inputSchema: {
      projectKey: z.string(),
      columnId: z.number().int().positive().optional(),
      columnName: z.string().optional(),
      priorities: z.array(z.number().int().min(0)).min(1).optional(),
      priorityMin: z.number().int().min(0).optional(),
      priorityMax: z.number().int().min(0).optional(),
      limit: z.number().int().min(1).max(100).optional(),
    },
    outputSchema: {
      result: TicketSearchResultSchema,
    },
  },
  async ({ projectKey, columnId, columnName, priorities, priorityMin, priorityMax, limit }) => {
    const project = getProjectByKey(projectKey);
    if (!project) {
      throw new Error(`Project ${projectKey} not found`);
    }

    let column = columnId ? getColumnById(columnId) : undefined;
    if (!column && columnName) {
      column = getColumnByName(project.id, columnName);
    }
    if (!column) {
      throw new Error(
        `Column ${columnId ? `#${columnId}` : `"${columnName ?? ''}"`} not found in project ${projectKey}`
      );
    }
    if (column.projectId !== project.id) {
      throw new Error(`Column ${column.id} does not belong to project ${projectKey}`);
    }

    const targetColumnId = column.id;
    let tickets = listTickets(project.id).filter((ticket) => ticket.columnId === targetColumnId);

    const normalizedPriorities = priorities
      ? Array.from(new Set(priorities)).sort((a, b) => a - b)
      : undefined;
    if (normalizedPriorities && normalizedPriorities.length > 0) {
      const allowed = new Set(normalizedPriorities);
      tickets = tickets.filter((ticket) => allowed.has(ticket.priority));
    }
    if (priorityMin !== undefined) {
      tickets = tickets.filter((ticket) => ticket.priority >= priorityMin);
    }
    if (priorityMax !== undefined) {
      tickets = tickets.filter((ticket) => ticket.priority <= priorityMax);
    }

    tickets = tickets.sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

    if (limit !== undefined) {
      tickets = tickets.slice(0, limit);
    }

    return respond({
      result: {
        project,
        column,
        filters: {
          priorities: normalizedPriorities ?? null,
          priorityMin: priorityMin ?? null,
          priorityMax: priorityMax ?? null,
          limit: limit ?? null,
        },
        count: tickets.length,
        ticketIds: tickets.map((ticket) => ticket.id),
        tickets,
      },
    });
  }
);


server.registerTool(
  'kanban_search_tickets',
  {
    title: 'Search Tickets',
    description: 'Search tickets in a project with optional filters and pagination.',
    inputSchema: {
      projectKey: z.string(),
      query: z.string().optional(),
      columnId: z.number().int().positive().optional(),
      columnName: z.string().optional(),
      priorities: z.array(z.number().int().min(0)).min(1).optional(),
      priorityMin: z.number().int().min(0).optional(),
      priorityMax: z.number().int().min(0).optional(),
      limit: z.number().int().min(1).max(200).optional(),
      offset: z.number().int().min(0).optional(),
    },
    outputSchema: {
      result: TicketQueryResultSchema,
    },
  },
  async ({
    projectKey,
    query,
    columnId,
    columnName,
    priorities,
    priorityMin,
    priorityMax,
    limit,
    offset,
  }) => {
    const project = getProjectByKey(projectKey);
    if (!project) {
      throw new Error(`Project ${projectKey} not found`);
    }

    let column = columnId ? getColumnById(columnId) : undefined;
    if (!column && columnName) {
      column = getColumnByName(project.id, columnName);
    }
    if (column && column.projectId !== project.id) {
      throw new Error(`Column ${column.id} does not belong to project ${projectKey}`);
    }

    let tickets = listTickets(project.id);
    if (column) {
      tickets = tickets.filter((ticket) => ticket.columnId === column!.id);
    }

    const normalizedPriorities = priorities
      ? Array.from(new Set(priorities)).sort((a, b) => a - b)
      : undefined;
    if (normalizedPriorities && normalizedPriorities.length > 0) {
      const allowed = new Set(normalizedPriorities);
      tickets = tickets.filter((ticket) => allowed.has(ticket.priority));
    }
    if (priorityMin !== undefined) {
      tickets = tickets.filter((ticket) => ticket.priority >= priorityMin);
    }
    if (priorityMax !== undefined) {
      tickets = tickets.filter((ticket) => ticket.priority <= priorityMax);
    }

    const normalizedQueryRaw = query?.trim();
    const normalizedQuery = normalizedQueryRaw ? normalizedQueryRaw.toLowerCase() : undefined;
    const numericQuery = normalizedQuery && /^\d+$/.test(normalizedQuery) ? Number(normalizedQuery) : null;
    if (normalizedQuery) {
      tickets = tickets.filter((ticket) => {
        const idText = String(ticket.id);
        if (idText === normalizedQuery || idText.includes(normalizedQuery)) {
          return true;
        }
        const haystack = `${ticket.title ?? ''} ${ticket.description ?? ''}`.toLowerCase();
        return haystack.includes(normalizedQuery);
      });
    }

    tickets = tickets.sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

    const total = tickets.length;
    const defaultLimit = limit ?? (numericQuery !== null ? 1 : 20);
    const limitValue = Math.min(defaultLimit, 200);
    const offsetValue = Math.max(0, offset ?? 0);
    const pagedTickets = tickets.slice(offsetValue, offsetValue + limitValue);
    const hasMore = offsetValue + limitValue < total;

    return respond({
      result: {
        project,
        column: column ?? null,
        filters: {
          query: normalizedQuery ?? null,
          columnId: column?.id ?? null,
          columnName: column?.name ?? null,
          priorities: normalizedPriorities ?? null,
          priorityMin: priorityMin ?? null,
          priorityMax: priorityMax ?? null,
          limit: limitValue ?? null,
          offset: offsetValue ?? null,
        },
        count: pagedTickets.length,
        total,
        offset: offsetValue,
        limit: limitValue,
        hasMore,
        ticketIds: pagedTickets.map((ticket) => ticket.id),
        tickets: pagedTickets,
      },
    });
  }
);

server.registerTool(
  'kanban_column_top_ticket',
  {
    title: 'Get Column Top Ticket',
    description: 'Return the highest-priority ticket (lowest priority value) from a column.',
    inputSchema: {
      projectKey: z.string(),
      columnId: z.number().int().positive().optional(),
      columnName: z.string().optional(),
      skipDone: z.boolean().optional(),
      skipReview: z.boolean().optional(),
    },
    outputSchema: {
      result: TicketLookupSchema.nullable(),
    },
  },
  async ({ projectKey, columnId, columnName, skipDone = false, skipReview = false }) => {
    const project = getProjectByKey(projectKey);
    if (!project) {
      throw new Error(`Project ${projectKey} not found`);
    }

    let column = columnId ? getColumnById(columnId) : undefined;
    if (!column && columnName) {
      column = getColumnByName(project.id, columnName);
    }
    if (!column) {
      throw new Error(
        `Column ${columnId ? `#${columnId}` : columnName ? `"${columnName}"` : '(unspecified)'} not found in project ${projectKey}`
      );
    }
    if (column.projectId !== project.id) {
      throw new Error(`Column ${column.id} does not belong to project ${projectKey}`);
    }

    const targetColumn = column;
    let tickets = listTickets(project.id).filter((ticket) => ticket.columnId === targetColumn.id);
    if (skipDone) {
      tickets = tickets.filter((ticket) => ticket.progressState !== 'done');
    }
    if (skipReview) {
      tickets = tickets.filter((ticket) => ticket.progressState !== 'review');
    }

    tickets = tickets.sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

    const top = tickets[0] ?? null;
    if (!top) {
      return respond({ result: null });
    }

    const epic = top.epicId ? getEpicById(top.epicId) ?? null : null;
    return respond({
      result: {
        ticket: top,
        project,
        column: targetColumn,
        epic,
        priorityLabel: `P${top.priority}`,
      },
    });
  }
);

server.registerTool(
  'kanban_create_project',
  {
    title: 'Create Project',
    description: 'Create a new project with optional custom column names',
    inputSchema: {
      key: z.string().min(2),
      name: z.string().min(1),
      description: z.string().optional(),
      columns: z.array(z.string().min(1)).optional(),
    },
    outputSchema: {
      project: ProjectSchema,
    },
  },
  async ({ key, name, description, columns }) => {
    try {
      const project = createProject({ key, name, description, columns });
      return respond({ project });
    } catch (error) {
      throw new Error(`Failed to create project: ${(error as Error).message}`);
    }
  }
);

server.registerTool(
  'kanban_create_column',
  {
    title: 'Create Column',
    description: 'Add a new column to a project',
    inputSchema: {
      projectKey: z.string(),
      name: z.string().min(1),
      orderIndex: z.number().int().min(0).optional(),
      wipLimit: z.number().int().positive().optional(),
    },
    outputSchema: {
      column: ColumnSchema,
    },
  },
  async ({ projectKey, name, orderIndex, wipLimit }) => {
    const project = getProjectByKey(projectKey);
    if (!project) {
      throw new Error(`Project ${projectKey} not found`);
    }
    const column = createColumn(project.id, { name, orderIndex });
    const finalColumn =
      typeof wipLimit === 'number'
        ? updateColumn(column.id, { wipLimit })
        : column;
    return respond({ column: finalColumn });
  }
);

server.registerTool(
  'kanban_rename_column',
  {
    title: 'Rename Column',
    description: 'Rename or update metadata for a column by id',
    inputSchema: {
      columnId: z.number().int().positive(),
      name: z.string().min(1).optional(),
      orderIndex: z.number().int().min(0).optional(),
      wipLimit: z.number().int().positive().nullable().optional(),
    },
    outputSchema: {
      column: ColumnSchema,
    },
  },
  async ({ columnId, name, orderIndex, wipLimit }) => {
    const column = getColumnById(columnId);
    if (!column) {
      throw new Error(`Column ${columnId} not found`);
    }
    const updated = updateColumn(columnId, {
      name,
      orderIndex,
      wipLimit: wipLimit === undefined ? undefined : wipLimit,
    });
    return respond({ column: updated });
  }
);

server.registerTool(
  'kanban_delete_column',
  {
    title: 'Delete Column',
    description: 'Delete a column by id (removes contained tickets)',
    inputSchema: {
      columnId: z.number().int().positive(),
    },
    outputSchema: SuccessShape,
  },
  async ({ columnId }) => {
    const column = getColumnById(columnId);
    if (!column) {
      throw new Error(`Column ${columnId} not found`);
    }
    deleteColumn(columnId);
    return respond({ success: true as const });
  }
);

server.registerTool(
  'kanban_create_ticket',
  {
    title: 'Create Ticket',
    description: 'Create a new ticket in a project column',
    inputSchema: {
      projectKey: z.string(),
      title: z.string().min(1),
      description: z.string().optional(),
      columnId: z.number().int().positive().optional(),
      columnName: z.string().optional(),
      estimate: scrumEstimateValue.optional(),
      epicId: z.number().int().positive().optional().nullable(),
      epicName: z.string().optional(),
    },
    outputSchema: {
      ticket: TicketSchema,
    },
  },
  async ({ projectKey, title, description, columnId, columnName, estimate, epicId, epicName }) => {
    const project = getProjectByKey(projectKey);
    if (!project) {
      throw new Error(`Project ${projectKey} not found`);
    }

    let resolvedColumnId = columnId;
    if (!resolvedColumnId && columnName) {
      const column = getColumnByName(project.id, columnName);
      if (!column) {
        throw new Error(`Column ${columnName} not found in project ${projectKey}`);
      }
      resolvedColumnId = column.id;
    }

    let resolvedEpicId = epicId ?? null;
    if ((!resolvedEpicId || Number.isNaN(resolvedEpicId)) && epicName) {
      const epic = getEpicByName(project.id, epicName);
      if (!epic) {
        throw new Error(`Epic ${epicName} not found in project ${projectKey}`);
      }
      resolvedEpicId = epic.id;
    }

    const ticket = createTicket(project.id, {
      title,
      description,
      columnId: resolvedColumnId,
      estimate: estimate ?? null,
      epicId: resolvedEpicId,
    });

    return respond({ ticket });
  }
);

server.registerTool(
  'kanban_update_ticket',
  {
    title: 'Update Ticket',
    description: 'Update ticket fields such as title, description, column, estimate, epic, or completion summary. When moving a ticket to Done, provide completionSummary with: 1) What was done, 2) Future improvements, 3) Separated work (links to related tickets). Deployment proof is optional.',
    inputSchema: {
      ticketId: z.number().int().positive(),
      title: z.string().min(1).optional(),
      description: z.string().optional(),
      columnId: z.number().int().positive().optional(),
      columnName: z.string().optional(),
      estimate: scrumEstimateValue.optional().nullable(),
      status: z.string().optional(),
      epicId: z.number().int().positive().optional().nullable(),
      epicName: z.string().optional().nullable(),
      completionSummary: z.string().describe('Required when moving to Done. Must include: 1) What was done, 2) Future improvements, 3) Separated work').optional(),
      deploymentProof: z.string().describe('Optional deployment or build URL').optional(),
      completionEvidence: z.array(completionEvidenceItemSchema).nullable().optional().describe('Optional structured completion evidence items, such as bu-browser screenshots. Each item requires label, url, and type.'),
    },
    outputSchema: {
      ticket: TicketSchema,
    },
  },
  async ({ ticketId, title, description, columnId, columnName, estimate, status, epicId, epicName, completionSummary, deploymentProof, completionEvidence }) => {
    const existingTicket = getTicketById(ticketId);
    if (!existingTicket) {
      throw new Error(`Ticket ${ticketId} not found`);
    }
    let resolvedColumnId = columnId;
    if (!resolvedColumnId && columnName) {
      const column = getColumnByName(existingTicket.projectId, columnName);
      if (!column) {
        throw new Error(`Column ${columnName} not found in project`);
      }
      resolvedColumnId = column.id;
    }
    const ticket = updateTicket(ticketId, {
      title,
      description,
      columnId: resolvedColumnId ?? undefined,
      estimate,
      status,
      epicId,
      epicName,
      completionSummary,
      deploymentProof,
      completionEvidence,
    });
    return respond({ ticket });
  }
);

server.registerTool(
  'kanban_move_ticket',
  {
    title: 'Move Ticket',
    description: 'Move a ticket to another column. When moving to Done, provide completionSummary with: 1) What was done, 2) Future improvements, 3) Separated work (links to related tickets). Deployment proof is optional.',
    inputSchema: {
      ticketId: z.number().int().positive(),
      columnId: z.number().int().positive().optional(),
      columnName: z.string().optional(),
      priority: z.number().int().min(0).optional(),
      completionSummary: z.string().describe('REQUIRED when moving to Done column. Must include: 1) What was done, 2) Future improvements, 3) Separated work (ticket links)').optional(),
      deploymentProof: z.string().describe('Optional deployment or build URL').optional(),
      completionEvidence: z.array(completionEvidenceItemSchema).nullable().optional().describe('Optional structured completion evidence items, such as bu-browser screenshots. Each item requires label, url, and type.'),
    },
    outputSchema: {
      ticket: TicketSchema,
    },
  },
  async ({ ticketId, columnId, columnName, priority, completionSummary, deploymentProof, completionEvidence }) => {
    const ticket = getTicketById(ticketId);
    if (!ticket) {
      throw new Error(`Ticket ${ticketId} not found`);
    }

    let targetColumnId = columnId;
    if (!targetColumnId) {
      if (!columnName) {
        throw new Error('Provide columnId or columnName to move the ticket');
      }
      const column = getColumnByName(ticket.projectId, columnName);
      if (!column) {
        throw new Error(`Column ${columnName} not found in project`);
      }
      targetColumnId = column.id;
    }

    const updated = moveTicket(ticketId, targetColumnId, {
      priority,
      completionSummary,
      deploymentProof,
      completionEvidence,
    });
    return respond({ ticket: updated });
  }
);

server.registerTool(
  'kanban_link_doc',
  {
    title: 'Link Documentation to Ticket',
    description: 'Associate a documentation path with a ticket.',
    inputSchema: {
      ticketId: z.number().int().positive(),
      docPath: z.string().min(1),
      linkType: z.string().optional(),
      docsProjectId: z.string().optional(),
      kanbanProjectId: z.string().uuid().optional(),
      projectKey: z.string().optional(),
    },
    outputSchema: {
      link: DocLinkSchema,
    },
  },
  async ({ ticketId, docPath, linkType, docsProjectId, kanbanProjectId, projectKey }) => {
    const ticket = getTicketById(ticketId);
    if (!ticket) {
      throw new Error(`Ticket ${ticketId} not found`);
    }
    let project = projectKey ? getProjectByKey(projectKey) : getProjectById(ticket.projectId);
    if (!project) {
      throw new Error('Project not found');
    }
    if (kanbanProjectId) {
      if (project.knowledgeProjectId && project.knowledgeProjectId !== kanbanProjectId) {
        throw new Error('knowledgeProjectId mismatch for this project');
      }
      if (!project.knowledgeProjectId) {
        project = setProjectKnowledgeId(project.id, kanbanProjectId);
      }
    }
    const link = upsertDocLink({
      projectId: project.id,
      ticketId: ticket.id,
      docPath: docPath.trim(),
      docsProjectId: docsProjectId ?? null,
      linkType: linkType ?? undefined,
    });
    return respond({ link });
  }
);

server.registerTool(
  'kanban_list_doc_links',
  {
    title: 'List Docs Linked to Ticket',
    description: 'Retrieve documentation links associated with a ticket.',
    inputSchema: {
      ticketId: z.number().int().positive(),
    },
    outputSchema: {
      links: z.array(DocLinkSchema),
    },
  },
  async ({ ticketId }) => {
    const ticket = getTicketById(ticketId);
    if (!ticket) {
      throw new Error(`Ticket ${ticketId} not found`);
    }
    const links = listDocLinksForTicket(ticket.projectId, ticket.id);
    return respond({ links });
  }
);

server.registerTool(
  'kanban_list_ticket_links',
  {
    title: 'List Tickets Linked to Doc',
    description: 'Find all tickets referencing a documentation path.',
    inputSchema: {
      projectKey: z.string(),
      docPath: z.string().min(1),
    },
    outputSchema: {
      docPath: z.string(),
      links: z.array(DocLinkWithTicketSchema),
    },
  },
  async ({ projectKey, docPath }) => {
    const project = getProjectByKey(projectKey);
    if (!project) {
      throw new Error(`Project ${projectKey} not found`);
    }
    const links = listDocLinksForDoc(project.id, docPath.trim()).map((link) => ({
      ...link,
      ticket: link.ticketId ? getTicketById(link.ticketId) ?? null : null,
    }));
    return respond({ docPath: docPath.trim(), links });
  }
);

server.registerTool(
  'kanban_reorder_column_tickets',
  {
    title: 'Reorder Column Tickets',
    description: 'Set the vertical order for tickets in a column. First ticket in the list receives priority 0.',
    inputSchema: {
      columnId: z.number().int().positive(),
      ticketIds: z.array(z.number().int().positive()),
    },
    outputSchema: {
      tickets: z.array(TicketSchema),
    },
  },
  async ({ columnId, ticketIds }) => {
    const column = getColumnById(columnId);
    if (!column) {
      throw new Error(`Column ${columnId} not found`);
    }
    reorderColumnTickets(columnId, ticketIds);
    const tickets = listTickets(column.projectId).filter((ticket) => ticket.columnId === columnId);
    return respond({ tickets });
  }
);

server.registerTool(
  'kanban_set_estimate',
  {
    title: 'Set Ticket Estimate',
    description: 'Assign a Scrum poker estimate to a ticket',
    inputSchema: {
      ticketId: z.number().int().positive(),
      estimate: scrumEstimateValue.nullable(),
    },
    outputSchema: {
      ticket: TicketSchema,
    },
  },
  async ({ ticketId, estimate }) => {
    if (!getTicketById(ticketId)) {
      throw new Error(`Ticket ${ticketId} not found`);
    }
    const ticket = setTicketEstimate(ticketId, estimate);
    return respond({ ticket });
  }
);

server.registerTool(
  'kanban_delete_ticket',
  {
    title: 'Delete Ticket',
    description: 'Delete a ticket by id',
    inputSchema: {
      ticketId: z.number().int().positive(),
    },
    outputSchema: SuccessShape,
  },
  async ({ ticketId }) => {
    if (!getTicketById(ticketId)) {
      throw new Error(`Ticket ${ticketId} not found`);
    }
    deleteTicket(ticketId);
    return respond({ success: true as const });
  }
);

server.registerTool(
  'kanban_list_epics',
  {
    title: 'List Epics',
    description: 'List all epics for a project',
    inputSchema: {
      projectKey: z.string(),
    },
    outputSchema: {
      epics: z.array(EpicSchema),
    },
  },
  async ({ projectKey }) => {
    const project = getProjectByKey(projectKey);
    if (!project) {
      throw new Error(`Project ${projectKey} not found`);
    }
    const epics = listEpics(project.id);
    return respond({ epics });
  }
);

server.registerTool(
  'kanban_create_epic',
  {
    title: 'Create Epic',
    description: 'Create a new epic in a project',
    inputSchema: {
      projectKey: z.string(),
      name: z.string().min(1),
      description: z.string().optional(),
      color: z.string().regex(hexColorRegex).optional().nullable(),
    },
    outputSchema: {
      epic: EpicSchema,
    },
  },
  async ({ projectKey, name, description, color }) => {
    const project = getProjectByKey(projectKey);
    if (!project) {
      throw new Error(`Project ${projectKey} not found`);
    }
    const epic = createEpic(project.id, {
      name,
      description: description ?? null,
      color: color ?? null,
    });
    return respond({ epic });
  }
);

server.registerTool(
  'kanban_update_epic',
  {
    title: 'Update Epic',
    description: 'Update epic name, description, or color',
    inputSchema: {
      epicId: z.number().int().positive(),
      name: z.string().min(1).optional(),
      description: z.string().optional().nullable(),
      color: z.string().regex(hexColorRegex).optional().nullable(),
    },
    outputSchema: {
      epic: EpicSchema,
    },
  },
  async ({ epicId, name, description, color }) => {
    if (!getEpicById(epicId)) {
      throw new Error(`Epic ${epicId} not found`);
    }
    const epic = updateEpic(epicId, {
      name,
      description: description ?? null,
      color: color ?? null,
    });
    return respond({ epic });
  }
);

server.registerTool(
  'kanban_delete_epic',
  {
    title: 'Delete Epic',
    description: 'Delete an epic by id',
    inputSchema: {
      epicId: z.number().int().positive(),
    },
    outputSchema: SuccessShape,
  },
  async ({ epicId }) => {
    if (!getEpicById(epicId)) {
      throw new Error(`Epic ${epicId} not found`);
    }
    deleteEpic(epicId);
    return respond({ success: true as const });
  }
);

server.registerTool(
  'kanban_get_metrics',
  {
    title: 'Get Project Metrics',
    description: 'Fetch burn-up, burndown, and velocity metrics for a project',
    inputSchema: {
      projectKey: z.string(),
    },
    outputSchema: {
      metrics: ProjectMetricsSchema,
    },
  },
  async ({ projectKey }) => {
    const project = getProjectByKey(projectKey);
    if (!project) {
      throw new Error(`Project ${projectKey} not found`);
    }
    const metrics = getProjectMetrics(project.id);
    return respond({ metrics });
  }
);

server.registerTool(
  'kanban_list_scrum_values',
  {
    title: 'List Scrum Estimates',
    description: 'Return the allowed Scrum poker estimate values',
    outputSchema: {
      values: z.array(z.number()),
    },
  },
  async () => respond({ values: DEFAULT_SCRUM_VALUES })
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Kanban MCP server ready on stdio transport');
}

main().catch((error) => {
  console.error('Failed to start MCP server', error);
  process.exit(1);
});
