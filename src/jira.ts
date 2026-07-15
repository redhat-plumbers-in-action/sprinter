import { AgileClient, Version3Client } from 'jira.js';
import { SearchResults, Sprint } from 'jira.js/dist/esm/types/agile/models';
import { Issue } from 'jira.js/dist/esm/types/version3/models/issue';

import chalk from 'chalk';

import { raise, tokenUnavailable } from './util';
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
    preliminaryTesting: 'customfield_10879',
  };

  readonly devTask = {
    name: 'DEV Task',
    summary: '[DEV Task]:',
    label: 'dev_task',
    value: '14476',
  };
  readonly qeTask = {
    name: 'QE Task',
    summary: '[QE Task]:',
    label: 'qe_task',
    value: '14480',
  };
  readonly upstreamTask = {
    name: 'Upstream',
    summary: '[Upstream]:',
    label: 'upstream_task',
    value: '14475',
  };
  readonly rootCauseAnalysisTask = {
    name: 'Root Cause Analysis Task',
    summary: '[Root Cause Analysis Task]:',
    label: 'root_cause_analysis_task',
    value: '14483',
  };
  readonly preliminaryTestingTask = {
    name: 'Preliminary Testing Task',
    summary: '[Preliminary Testing Task]:',
    label: 'preliminary_testing_task',
    value: '14478',
  };
  readonly integrationTestingTask = {
    name: 'Integration Testing',
    summary: '[Integration Testing Task]:',
    label: 'integration_testing_task',
    value: '14481',
  };
  readonly availableTasks = [
    { ...this.devTask, checked: true },
    { ...this.qeTask, checked: true },
    { ...this.upstreamTask, checked: false },
    { ...this.rootCauseAnalysisTask, checked: false },
    { ...this.preliminaryTestingTask, checked: false },
    { ...this.integrationTestingTask, checked: false },
  ];
  readonly availableTasksLabels = this.availableTasks.map(task => task.label);

  readonly nonTaskIssuesJQL = `(labels not in (${this.availableTasksLabels.join(', ')}) OR labels is EMPTY) AND type in (Bug, "Story", Vulnerability) AND Project = RHEL AND statusCategory != Done`;

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
    nonTaskIssues: boolean = true
  ): Promise<SearchResults['issues']> {
    let jql = assignee ? `assignee = "${assignee}"` : '';
    jql += nonTaskIssues ? ` AND ${this.nonTaskIssuesJQL}` : '';

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

  async getBoardIssues(
    boardId: number,
    jql?: string
  ): Promise<SearchResults['issues']> {
    const response = await this.agile.board.getIssuesForBoard({
      boardId: boardId,
      maxResults: 500,
      jql: jql ?? '',
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
        this.fields.preliminaryTesting,
        'issuelinks',
      ],
    });

    return response.issues;
  }

  composeTaskSummaryJQL(expectedTasks: string[]) {
    return `summary ~ "\\\\[${expectedTasks.join('\\\\]: " OR summary ~ "\\\\[')}\\\\]: "`;
  }

  async getlinkedTasks(issue: string, expectedTasks: string[]) {
    if (this.dry) {
      this.logger.log(
        `  ${chalk.dim(`Fetching linked tasks for ${issue} (dry-run)`)}`
      );
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

  async createTasks(issue: string, tasks: string[]) {
    if (this.dry) {
      this.logger.log(
        `  ${chalk.dim(`Creating tasks ${tasks.join(', ')} for ${issue} (dry-run)`)}`
      );
      return;
    }

    this.logger.log(
      `  ${chalk.cyan(`Creating tasks ${tasks.join(', ')} for ${issue}`)}`
    );
    await this.api.issues.editIssue({
      issueIdOrKey: issue,
      fields: {
        // Jira expects multi-select values as objects with id/value
        [this.fields.automation]: tasks.map(id => ({ id: id })),
      },
    });
  }

  async closeTask(issue: string) {
    if (this.dry) {
      this.logger.log(`  ${chalk.dim(`Closing task ${issue} (dry-run)`)}`);
      return;
    }

    this.logger.log(`  ${chalk.cyan(`Closing task ${issue}`)}`);

    await this.api.issues.doTransition({
      issueIdOrKey: issue,
      transition: {
        id: '31',
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

  static async getInstance(dryRun: boolean, logger: Logger, assignee: string) {
    const apiToken = process.env.JIRA_API_TOKEN ?? tokenUnavailable();

    const instance = new this(
      'https://redhat.atlassian.net',
      apiToken,
      dryRun,
      logger,
      assignee
    );

    const version = await instance.getVersion();
    logger.log(chalk.dim(`JIRA v${version}`));

    return instance;
  }
}
