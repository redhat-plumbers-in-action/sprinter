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
        qeTask: {
          name: 'QE Task',
          summary: '[QE Task]:',
          label: 'qe_task',
          value: '14480',
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
          status: { name: 'New' },
          customfield_10879: { value: 'Requested' },
          issuelinks: [],
        },
      },
      {
        key: 'RHEL-1001',
        fields: {
          status: { name: 'New' },
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
          status: { name: 'New' },
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
          status: { name: 'New' },
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
          status: { name: 'New' },
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
          status: { name: 'New' },
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
          status: { name: 'New' },
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
          status: { name: 'New' },
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
          status: { name: 'New' },
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
          status: { name: 'New' },
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
          status: { name: 'New' },
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
          status: { name: 'New' },
          customfield_10879: { value: 'Requested' },
          issuelinks: [],
        },
      },
      {
        key: 'RHEL-5100',
        fields: {
          status: { name: 'New' },
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

  test('creates QE task for issues in Integration status without an open QE split task', async () => {
    mocks.getBoardIssues.mockResolvedValue([
      {
        key: 'RHEL-6000',
        fields: {
          status: { name: 'Integration' },
          issuelinks: [],
        },
      },
      {
        key: 'RHEL-6001',
        fields: {
          status: { name: 'Integration' },
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
    expect(mocks.createTasks).toHaveBeenCalledWith('RHEL-6000', ['14480']);
    expect(mocks.createTasks).toHaveBeenCalledWith('RHEL-6001', ['14480']);
  });

  test('skips issues in Integration that already have an open QE split task', async () => {
    mocks.getBoardIssues.mockResolvedValue([
      {
        key: 'RHEL-6100',
        fields: {
          status: { name: 'Integration' },
          issuelinks: [
            {
              type: { outward: 'split to' },
              outwardIssue: {
                fields: {
                  summary: '[QE Task]: RHEL-6100',
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

  test('creates QE task when the existing QE split task is Closed', async () => {
    mocks.getBoardIssues.mockResolvedValue([
      {
        key: 'RHEL-6200',
        fields: {
          status: { name: 'Integration' },
          issuelinks: [
            {
              type: { outward: 'split to' },
              outwardIssue: {
                fields: {
                  summary: '[QE Task]: RHEL-6200',
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
    expect(mocks.createTasks).toHaveBeenCalledWith('RHEL-6200', ['14480']);
  });

  test('skips Integration issues without a key when creating QE tasks', async () => {
    mocks.getBoardIssues.mockResolvedValue([
      {
        key: undefined,
        fields: {
          status: { name: 'Integration' },
          issuelinks: [],
        },
      },
    ]);

    await runAuto(defaultOptions);

    expect(mocks.createTasks).not.toHaveBeenCalled();
  });

  test('does not create QE task for issues not in Integration status', async () => {
    mocks.getBoardIssues.mockResolvedValue([
      {
        key: 'RHEL-6300',
        fields: {
          status: { name: 'In Progress' },
          issuelinks: [],
        },
      },
    ]);

    await runAuto(defaultOptions);

    expect(mocks.createTasks).not.toHaveBeenCalled();
  });

  test('closes QE task for issues in Release Pending with an open QE split task', async () => {
    mocks.getBoardIssues.mockResolvedValue([
      {
        key: 'RHEL-8000',
        fields: {
          status: { name: 'Release Pending' },
          issuelinks: [
            {
              type: { outward: 'split to' },
              outwardIssue: {
                key: 'RHEL-8001',
                fields: {
                  summary: '[QE Task]: RHEL-8000',
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
    expect(mocks.closeTask).toHaveBeenCalledWith('RHEL-8001');
  });

  test('does not close QE task for Release Pending issues when it is already Closed', async () => {
    mocks.getBoardIssues.mockResolvedValue([
      {
        key: 'RHEL-8100',
        fields: {
          status: { name: 'Release Pending' },
          issuelinks: [
            {
              type: { outward: 'split to' },
              outwardIssue: {
                key: 'RHEL-8101',
                fields: {
                  summary: '[QE Task]: RHEL-8100',
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

  test('does not close QE task for Release Pending issues without a QE split task', async () => {
    mocks.getBoardIssues.mockResolvedValue([
      {
        key: 'RHEL-8200',
        fields: {
          status: { name: 'Release Pending' },
          issuelinks: [
            {
              type: { outward: 'blocks' },
              outwardIssue: {
                key: 'RHEL-8201',
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

  test('skips closing QE task for Release Pending issues without a key', async () => {
    mocks.getBoardIssues.mockResolvedValue([
      {
        key: undefined,
        fields: {
          status: { name: 'Release Pending' },
          issuelinks: [
            {
              type: { outward: 'split to' },
              outwardIssue: {
                key: 'RHEL-8301',
                fields: {
                  summary: '[QE Task]: RHEL-8300',
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

  test('skips closing when Release Pending QE split task has no key', async () => {
    mocks.getBoardIssues.mockResolvedValue([
      {
        key: 'RHEL-8400',
        fields: {
          status: { name: 'Release Pending' },
          issuelinks: [
            {
              type: { outward: 'split to' },
              outwardIssue: {
                fields: {
                  summary: '[QE Task]: RHEL-8400',
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

  test('handles all issue types together', async () => {
    mocks.getBoardIssues.mockResolvedValue([
      {
        key: 'RHEL-7000',
        fields: {
          status: { name: 'New' },
          customfield_10879: { value: 'Requested' },
          issuelinks: [],
        },
      },
      {
        key: 'RHEL-7100',
        fields: {
          status: { name: 'New' },
          customfield_10879: { value: 'Fail' },
          issuelinks: [
            {
              type: { outward: 'split to' },
              outwardIssue: {
                key: 'RHEL-7101',
                fields: {
                  summary: '[Preliminary Testing Task]: RHEL-7100',
                  status: { name: 'Open' },
                },
              },
            },
          ],
        },
      },
      {
        key: 'RHEL-7200',
        fields: {
          status: { name: 'Integration' },
          issuelinks: [],
        },
      },
      {
        key: 'RHEL-7300',
        fields: {
          status: { name: 'Release Pending' },
          issuelinks: [
            {
              type: { outward: 'split to' },
              outwardIssue: {
                key: 'RHEL-7301',
                fields: {
                  summary: '[QE Task]: RHEL-7300',
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
    expect(mocks.createTasks).toHaveBeenCalledWith('RHEL-7000', ['14478']);
    expect(mocks.createTasks).toHaveBeenCalledWith('RHEL-7200', ['14480']);
    expect(mocks.closeTask).toHaveBeenCalledTimes(2);
    expect(mocks.closeTask).toHaveBeenCalledWith('RHEL-7101');
    expect(mocks.closeTask).toHaveBeenCalledWith('RHEL-7301');
  });
});
