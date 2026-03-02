import { AgileClient, Version3Client } from 'jira.js';
import { SearchResults, Sprint } from 'jira.js/dist/esm/types/agile/models';
import { Issue } from 'jira.js/dist/esm/types/version3/models/issue';

import { raise } from './util';
import { Size } from './schema/jira';
import { Logger } from './logger';

export class Jira {
  readonly api: Version3Client;
  readonly agile: AgileClient;
  readonly fields = {
    automation: 'customfield_10553',
    assignee: 'assignee',
    priority: 'priority',
    severity: 'customfield_10840',
    sprint: 'customfield_10020',
    storyPoints: 'customfield_10028',
  };

  readonly issuesWithoutTasksJQL = `(labels not in (upstream_task, dev_task, qe_task, root_cause_analysis_task, preliminary_testing_task, integration_testing_task) OR labels is EMPTY) AND type in (Bug, "Story", Vulnerability) AND Project = RHEL AND statusCategory != Done`;

  constructor(
    readonly instance: string,
    apiToken: string,
    readonly dry: boolean,
    readonly logger: Logger,
    email: string
  ) {
    this.api = new Version3Client({
      host: instance,
      authentication: {
        basic: {
          email,
          apiToken,
        },
      },
    });

    this.agile = new AgileClient({
      host: instance,
      authentication: {
        basic: {
          email,
          apiToken,
        },
      },
    });
  }

  async getVersion(): Promise<string> {
    const response = await this.api.serverInfo.getServerInfo();
    return response.version ?? raise('Jira.getVersion(): missing version.');
  }

  async getSprints(boardId: number): Promise<Sprint[]> {
    const response = await this.agile.board.getAllSprints({
      boardId: boardId,
      state: 'active,future',
    });

    return response.values;
  }

  async getIssuesInSprint(
    sprintId: number,
    assignee?: string,
    issuesWithoutTasks: boolean = true
  ): Promise<SearchResults['issues']> {
    let jql = assignee ? `assignee = "${assignee}"` : '';
    jql += issuesWithoutTasks ? ` AND ${this.issuesWithoutTasksJQL}` : '';

    const response = await this.agile.sprint.getIssuesForSprint({
      sprintId: +sprintId,
      jql,
      maxResults: 500,
      fields: [
        'id',
        'issuetype',
        'status',
        'summary',
        'assignee',
        'priority',
        'components',
        this.fields.storyPoints,
        this.fields.severity,
        'issuelinks',
      ],
    });

    return response.issues;
  }

  async getBacklog(
    boardId: number,
    assignee?: string
  ): Promise<SearchResults['issues']> {
    const response = await this.agile.board.getIssuesForBacklog({
      boardId: boardId,
      jql: assignee ? `assignee = "${assignee}"` : undefined,
      maxResults: 500,
      fields: [
        'id',
        'issuetype',
        'status',
        'summary',
        'assignee',
        'priority',
        'components',
        this.fields.storyPoints,
        this.fields.severity,
      ],
    });

    return response.issues;
  }

  composeTaskSummaryJQL(expectedTasks: string[]) {
    return `summary ~ "\\\\[${expectedTasks.join('\\\\]: " OR summary ~ "\\\\[')}\\\\]: "`;
  }

  async getlinkedTasks(issue: string, expectedTasks: string[]) {
    if (this.dry) {
      this.logger.log(`Would get linked tasks for issue: ${issue}`);
      return [
        {
          key: 'RHEL-1234',
          fields: {
            summary: '[DEV Task] Test Task',
          },
        },
        {
          key: 'RHEL-1235',
          fields: {
            summary: '[QE Task] Test Task',
          },
        },
        {
          key: 'RHEL-1236',
          fields: {
            summary: '[Upstream] Test Task',
          },
        },
      ] as unknown as Issue[];
    }

    const response =
      await this.api.issueSearch.searchForIssuesUsingJqlEnhancedSearchPost({
        jql: `issue in linkedIssues("${issue}") AND type = Task AND status = New AND (${this.composeTaskSummaryJQL(expectedTasks)})`,
        fields: [
          'id',
          'issuetype',
          'status',
          'components',
          'summary',
          'assignee',
          this.fields.storyPoints,
        ],
      });

    return response.issues ?? [];
  }

  async createTasks(issue: string, tasks: number[]) {
    if (this.dry) {
      this.logger.log(
        `Would create tasks: ${tasks.join(', ')} for issue: ${issue}`
      );
      return;
    }

    this.logger.log(`Creating tasks: ${tasks.join(', ')} for issue: ${issue}`);
    await this.api.issues.editIssue({
      issueIdOrKey: issue,
      fields: {
        // Jira expects multi-select values as objects with id/value
        [this.fields.automation]: tasks.map(id => ({ id: String(id) })),
      },
    });
  }

  async setValues(
    issue: string,
    values: {
      assignee?: string;
      size?: Size;
      sprint?: number | null;
    }
  ) {
    const assigneeValue = values.assignee
      ? { [this.fields.assignee]: { accountId: values.assignee } }
      : {};
    const storyPointsValue =
      values.size !== undefined
        ? { [this.fields.storyPoints]: values.size }
        : {};
    const sprintValue =
      values.sprint !== undefined
        ? { [this.fields.sprint]: values.sprint }
        : {};

    await this.api.issues.editIssue({
      issueIdOrKey: issue,
      fields: { ...assigneeValue, ...storyPointsValue, ...sprintValue },
    });
  }

  getIssueURL(issue: string) {
    return `${this.instance}/browse/${issue}`;
  }
}
