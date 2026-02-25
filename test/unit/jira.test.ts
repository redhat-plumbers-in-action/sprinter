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
  const Version2Client = vi.fn(function () {
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
    Version2Client,
    AgileClient,
  };
});

describe('Jira functions', () => {
  let jira: Jira;

  beforeEach(() => {
    jira = new Jira(
      'https://issues.redhat.com',
      'token',
      false,
      new Logger(false)
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
      ],
      jql: 'assignee = \"assignee\" AND issueFunction not in linkedIssuesOf("type = Task AND (summary ~ \'DEV Task\' OR summary ~ \'QE Task\')") AND type not in (Task, Epic) AND project = "RHEL"',
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
        assignee: { name: 'assignee' },
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
        assignee: { name: 'assignee' },
        [jira.fields.storyPoints]: 3,
        [jira.fields.sprint]: null,
      },
    });
  });

  test('getIssueURL()', () => {
    expect(jira.getIssueURL('RHEL-1234')).toMatchInlineSnapshot(
      `"https://issues.redhat.com/browse/RHEL-1234"`
    );
  });
});
