import { afterEach, beforeEach, describe, expect, it, test, vi } from 'vitest';

import { Jira } from '../../src/jira';
import { Logger } from '../../src/logger';

const mocks = vi.hoisted(() => {
  return {
    getServerInfo: vi.fn(),
    searchForIssuesUsingJqlPost: vi.fn(),
    getIssuesForSprint: vi.fn(),
    editIssue: vi.fn(),
    getAllSprints: vi.fn(),
  };
});

vi.mock('jira.js', () => {
  const Version3Client = vi.fn(function () {
    return {
      serverInfo: {
        getServerInfo: mocks.getServerInfo,
      },
      issueSearch: {
        searchForIssuesUsingJqlPost: mocks.searchForIssuesUsingJqlPost,
      },
      issues: {
        editIssue: mocks.editIssue,
      },
    };
  });

  const AgileClient = vi.fn(function () {
    return {
      board: {
        getAllSprints: mocks.getAllSprints,
      },
      sprint: {
        getIssuesForSprint: mocks.getIssuesForSprint,
      },
    };
  });

  return {
    Version3Client,
    AgileClient,
  };
});

describe('Jira functions', () => {
  let jira: Jira;

  beforeEach(() => {
    jira = new Jira(
      'https://redhat.atlassian.net',
      'token',
      false,
      new Logger(false),
      'username'
    );

    mocks.getServerInfo.mockReturnValue({
      version: '8.0.0',
    });

    mocks.searchForIssuesUsingJqlPost.mockReturnValue({
      issues: [
        {
          key: 'RHEL-1234',
          fields: {
            issuetype: {
              name: 'Story',
            },
            status: {
              name: 'Open',
            },
            assignee: {
              displayName: 'assignee',
            },
            summary: 'summary',
            [jira.fields.storyPoints]: 3,
            [jira.fields.priority]: {
              name: 'High',
            },
          },
        },
        {
          key: 'RHEL-1235',
          fields: {
            issuetype: {
              name: 'Story',
            },
            status: {
              name: 'Open',
            },
            assignee: {
              displayName: 'assignee',
            },
            summary: 'summary',
            [jira.fields.storyPoints]: 5,
            [jira.fields.priority]: {
              name: 'Low',
            },
          },
        },
      ],
    });

    mocks.editIssue.mockReturnValue({});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('can be instantiated', () => {
    expect(jira).toBeInstanceOf(Jira);
  });

  test('getVersion()', async () => {
    expect(await jira.getVersion()).toMatchInlineSnapshot(`"8.0.0"`);
  });

  test('getIssuesInSprint()', async () => {
    mocks.getIssuesForSprint.mockReturnValue({
      issues: [
        {
          key: 'RHEL-1234',
          fields: {
            // ...
          },
        },
      ],
    });

    await jira.getIssuesInSprint(1, 'assignee');
    expect(mocks.getIssuesForSprint).toHaveBeenCalledWith({
      fields: [
        'id',
        'issuetype',
        'status',
        'summary',
        'assignee',
        'priority',
        'components',
        jira.fields.storyPoints,
        jira.fields.severity,
        'issuelinks',
      ],
      jql: 'assignee = "assignee" AND (labels not in (upstream_task, dev_task, qe_task, root_cause_analysis_task, preliminary_testing_task, integration_testing_task) OR labels is EMPTY) AND type in (Bug, "Story", Vulnerability) AND Project = RHEL AND statusCategory != Done',
      maxResults: 500,
      sprintId: 1,
    });
  });

  test('composeTaskSummaryJQL()', () => {
    expect(jira.composeTaskSummaryJQL([])).toMatchInlineSnapshot(
      `"summary ~ "\\\\[\\\\]: ""`
    );
    expect(jira.composeTaskSummaryJQL(['Upstream'])).toMatchInlineSnapshot(
      `"summary ~ "\\\\[Upstream\\\\]: ""`
    );
    expect(
      jira.composeTaskSummaryJQL(['DEV Task', 'QE Task'])
    ).toMatchInlineSnapshot(
      `"summary ~ "\\\\[DEV Task\\\\]: " OR summary ~ "\\\\[QE Task\\\\]: ""`
    );
  });

  test('setValues()', async () => {
    await jira.setValues('RHEL-1234', {
      assignee: 'assignee',
      sprint: 1,
    });

    expect(mocks.editIssue).toHaveBeenCalledWith({
      issueIdOrKey: 'RHEL-1234',
      fields: {
        assignee: { accountId: 'assignee' },
        [jira.fields.sprint]: 1,
      },
    });

    await jira.setValues('RHEL-1234', {
      assignee: 'assignee',
      size: 3,
      sprint: null,
    });

    expect(mocks.editIssue).toHaveBeenCalledWith({
      issueIdOrKey: 'RHEL-1234',
      fields: {
        assignee: { accountId: 'assignee' },
        [jira.fields.storyPoints]: 3,
        [jira.fields.sprint]: null,
      },
    });
  });

  test('getIssueURL()', () => {
    expect(jira.getIssueURL('RHEL-1234')).toMatchInlineSnapshot(
      `"https://redhat.atlassian.net/browse/RHEL-1234"`
    );
  });
});
