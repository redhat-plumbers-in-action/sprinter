import { AgileClient, Version2Client } from 'jira.js';
import { SearchResults, Sprint } from 'jira.js/dist/esm/types/agile/models';

import { raise } from './util';
import { Size } from './schema/jira';
import { Logger } from './logger';

export class Jira {
  readonly api: Version2Client;
  readonly agile: AgileClient;
  readonly fields = {
    automation: 'customfield_12316240',
    assignee: 'assignee',
    priority: 'priority',
    severity: 'customfield_12316142',
    sprint: 'customfield_12310940',
    storyPoints: 'customfield_12310243',
  };

  readonly issuesWithoutTasksJQL = `issueFunction not in linkedIssuesOf("type = Task AND (summary ~ 'DEV Task' OR summary ~ 'QE Task')") AND type not in (Task, Epic) AND project = "RHEL"`;

  constructor(
    readonly instance: string,
    apiToken: string,
    readonly dry: boolean,
    readonly logger: Logger
  ) {
    this.api = new Version2Client({
      host: instance,
      authentication: {
        oauth2: {
          accessToken: apiToken,
        },
      },
    });

    this.agile = new AgileClient({
      host: instance,
      authentication: {
        oauth2: {
          accessToken: apiToken,
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
    const response = await this.api.issueSearch.searchForIssuesUsingJqlPost({
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
      ? { [this.fields.assignee]: { name: values.assignee } }
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
