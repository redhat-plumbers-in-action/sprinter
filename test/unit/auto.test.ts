import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { runAuto } from '../../src/auto';

const mocks = vi.hoisted(() => {
  return {
    getBoardIssues: vi.fn(),
    createTasks: vi.fn(),
    processExit: vi.fn(),
  };
});

vi.mock('../../src/jira', () => {
  return {
    Jira: {
      getInstance: vi.fn().mockResolvedValue({
        fields: {
          preliminaryTesting: 'customfield_10879',
        },
        preliminaryTestingTask: {
          name: 'Preliminary Testing Task',
          summary: '[Preliminary Testing Task]:',
          label: 'preliminary_testing_task',
          value: '14478',
        },
        getBoardIssues: mocks.getBoardIssues,
        createTasks: mocks.createTasks,
      }),
    },
  };
});

describe('runAuto()', () => {
  beforeEach(() => {
    vi.spyOn(process, 'exit').mockImplementation(mocks.processExit as never);
    mocks.getBoardIssues.mockResolvedValue([]);
    mocks.createTasks.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  const defaultOptions = {
    board: 123,
    dry: false,
    nocolor: true,
    assignee: 'user@redhat.com',
  };

  test('creates tasks for issues with Preliminary Testing = "Requested" that lack an open split task', async () => {
    mocks.getBoardIssues.mockResolvedValue([
      {
        key: 'RHEL-1000',
        fields: {
          customfield_10879: { value: 'Requested' },
          issuelinks: [],
        },
      },
      {
        key: 'RHEL-1001',
        fields: {
          customfield_10879: { value: 'Requested' },
          issuelinks: [
            {
              type: { outward: 'blocks' },
              outwardIssue: {
                fields: {
                  summary: 'Unrelated link',
                  status: { name: 'Open' },
                },
              },
            },
          ],
        },
      },
    ]);

    await runAuto(defaultOptions);

    expect(mocks.createTasks).toHaveBeenCalledTimes(2);
    expect(mocks.createTasks).toHaveBeenCalledWith('RHEL-1000', ['14478']);
    expect(mocks.createTasks).toHaveBeenCalledWith('RHEL-1001', ['14478']);
  });

  test('skips issues with Preliminary Testing = "Requested" that already have an open split task', async () => {
    mocks.getBoardIssues.mockResolvedValue([
      {
        key: 'RHEL-2000',
        fields: {
          customfield_10879: { value: 'Requested' },
          issuelinks: [
            {
              type: { outward: 'split to' },
              outwardIssue: {
                fields: {
                  summary: '[Preliminary Testing Task]: RHEL-2000',
                  status: { name: 'Open' },
                },
              },
            },
          ],
        },
      },
    ]);

    await runAuto(defaultOptions);

    expect(mocks.createTasks).not.toHaveBeenCalled();
  });

  test('does not skip issues where the existing split task is Closed', async () => {
    mocks.getBoardIssues.mockResolvedValue([
      {
        key: 'RHEL-2100',
        fields: {
          customfield_10879: { value: 'Requested' },
          issuelinks: [
            {
              type: { outward: 'split to' },
              outwardIssue: {
                fields: {
                  summary: '[Preliminary Testing Task]: RHEL-2100',
                  status: { name: 'Closed' },
                },
              },
            },
          ],
        },
      },
    ]);

    await runAuto(defaultOptions);

    expect(mocks.createTasks).toHaveBeenCalledTimes(1);
    expect(mocks.createTasks).toHaveBeenCalledWith('RHEL-2100', ['14478']);
  });

  test('does not create tasks for issues with Preliminary Testing = "Failed"', async () => {
    mocks.getBoardIssues.mockResolvedValue([
      {
        key: 'RHEL-3000',
        fields: {
          customfield_10879: { value: 'Failed' },
          issuelinks: [
            {
              type: { outward: 'split to' },
              outwardIssue: {
                fields: {
                  summary: '[Preliminary Testing Task]: RHEL-3000',
                  status: { name: 'In Progress' },
                },
              },
            },
          ],
        },
      },
    ]);

    await runAuto(defaultOptions);

    expect(mocks.createTasks).not.toHaveBeenCalled();
  });

  test('skips issues without a key', async () => {
    mocks.getBoardIssues.mockResolvedValue([
      {
        key: undefined,
        fields: {
          customfield_10879: { value: 'Requested' },
          issuelinks: [],
        },
      },
    ]);

    await runAuto(defaultOptions);

    expect(mocks.createTasks).not.toHaveBeenCalled();
  });

  test('calls process.exit(0) on completion', async () => {
    mocks.getBoardIssues.mockResolvedValue([]);

    await runAuto(defaultOptions);

    expect(mocks.processExit).toHaveBeenCalledWith(0);
  });

  test('handles empty board with no issues', async () => {
    mocks.getBoardIssues.mockResolvedValue([]);

    await runAuto(defaultOptions);

    expect(mocks.createTasks).not.toHaveBeenCalled();
    expect(mocks.processExit).toHaveBeenCalledWith(0);
  });
});
