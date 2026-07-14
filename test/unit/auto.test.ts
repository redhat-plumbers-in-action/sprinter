import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { runAuto } from '../../src/auto';

const mocks = vi.hoisted(() => {
  return {
    getBoardIssues: vi.fn(),
    createTasks: vi.fn(),
    closeTask: vi.fn(),
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
        closeTask: mocks.closeTask,
      }),
    },
  };
});

describe('runAuto()', () => {
  beforeEach(() => {
    vi.spyOn(process, 'exit').mockImplementation(mocks.processExit as never);
    mocks.getBoardIssues.mockResolvedValue([]);
    mocks.createTasks.mockResolvedValue(undefined);
    mocks.closeTask.mockResolvedValue(undefined);
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

  test('does not create tasks for issues with Preliminary Testing = "Fail"', async () => {
    mocks.getBoardIssues.mockResolvedValue([
      {
        key: 'RHEL-3000',
        fields: {
          customfield_10879: { value: 'Fail' },
          issuelinks: [
            {
              type: { outward: 'split to' },
              outwardIssue: {
                key: 'RHEL-3001',
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
    expect(mocks.closeTask).not.toHaveBeenCalled();
    expect(mocks.processExit).toHaveBeenCalledWith(0);
  });

  test('closes the linked preliminary testing task when testing has failed', async () => {
    mocks.getBoardIssues.mockResolvedValue([
      {
        key: 'RHEL-4000',
        fields: {
          customfield_10879: { value: 'Fail' },
          issuelinks: [
            {
              type: { outward: 'split to' },
              outwardIssue: {
                key: 'RHEL-4001',
                fields: {
                  summary: '[Preliminary Testing Task]: RHEL-4000',
                  status: { name: 'In Progress' },
                },
              },
            },
          ],
        },
      },
    ]);

    await runAuto(defaultOptions);

    expect(mocks.closeTask).toHaveBeenCalledTimes(1);
    expect(mocks.closeTask).toHaveBeenCalledWith('RHEL-4001');
  });

  test('does not close tasks for "Fail" issues when the linked task is already Closed', async () => {
    mocks.getBoardIssues.mockResolvedValue([
      {
        key: 'RHEL-4100',
        fields: {
          customfield_10879: { value: 'Fail' },
          issuelinks: [
            {
              type: { outward: 'split to' },
              outwardIssue: {
                key: 'RHEL-4101',
                fields: {
                  summary: '[Preliminary Testing Task]: RHEL-4100',
                  status: { name: 'Closed' },
                },
              },
            },
          ],
        },
      },
    ]);

    await runAuto(defaultOptions);

    expect(mocks.closeTask).not.toHaveBeenCalled();
  });

  test('skips closing when "Fail" issue has no matching split task link', async () => {
    mocks.getBoardIssues.mockResolvedValue([
      {
        key: 'RHEL-4200',
        fields: {
          customfield_10879: { value: 'Fail' },
          issuelinks: [
            {
              type: { outward: 'blocks' },
              outwardIssue: {
                key: 'RHEL-4201',
                fields: {
                  summary: 'Unrelated task',
                  status: { name: 'Open' },
                },
              },
            },
          ],
        },
      },
    ]);

    await runAuto(defaultOptions);

    expect(mocks.closeTask).not.toHaveBeenCalled();
  });

  test('skips closing when "Fail" issue has no key', async () => {
    mocks.getBoardIssues.mockResolvedValue([
      {
        key: undefined,
        fields: {
          customfield_10879: { value: 'Fail' },
          issuelinks: [
            {
              type: { outward: 'split to' },
              outwardIssue: {
                key: 'RHEL-4301',
                fields: {
                  summary: '[Preliminary Testing Task]: RHEL-4300',
                  status: { name: 'In Progress' },
                },
              },
            },
          ],
        },
      },
    ]);

    await runAuto(defaultOptions);

    expect(mocks.closeTask).not.toHaveBeenCalled();
  });

  test('skips closing when the linked split task has no key', async () => {
    mocks.getBoardIssues.mockResolvedValue([
      {
        key: 'RHEL-4400',
        fields: {
          customfield_10879: { value: 'Fail' },
          issuelinks: [
            {
              type: { outward: 'split to' },
              outwardIssue: {
                fields: {
                  summary: '[Preliminary Testing Task]: RHEL-4400',
                  status: { name: 'In Progress' },
                },
              },
            },
          ],
        },
      },
    ]);

    await runAuto(defaultOptions);

    expect(mocks.closeTask).not.toHaveBeenCalled();
  });

  test('handles both "Requested" and "Fail" issues in the same board', async () => {
    mocks.getBoardIssues.mockResolvedValue([
      {
        key: 'RHEL-5000',
        fields: {
          customfield_10879: { value: 'Requested' },
          issuelinks: [],
        },
      },
      {
        key: 'RHEL-5100',
        fields: {
          customfield_10879: { value: 'Fail' },
          issuelinks: [
            {
              type: { outward: 'split to' },
              outwardIssue: {
                key: 'RHEL-5101',
                fields: {
                  summary: '[Preliminary Testing Task]: RHEL-5100',
                  status: { name: 'Open' },
                },
              },
            },
          ],
        },
      },
    ]);

    await runAuto(defaultOptions);

    expect(mocks.createTasks).toHaveBeenCalledTimes(1);
    expect(mocks.createTasks).toHaveBeenCalledWith('RHEL-5000', ['14478']);
    expect(mocks.closeTask).toHaveBeenCalledTimes(1);
    expect(mocks.closeTask).toHaveBeenCalledWith('RHEL-5101');
  });
});
