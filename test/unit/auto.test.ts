/// <reference types="node" />
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { runAuto } from '../../src/auto';

const mocks = vi.hoisted(() => {
  return {
    getBoardIssues: vi.fn(),
    getActiveSprint: vi.fn(),
    addToSprint: vi.fn(),
    createTasks: vi.fn(),
    closeTask: vi.fn(),
    setDueDate: vi.fn(),
    getlinkedTasks: vi.fn(),
    processExit: vi.fn(),
    whoami: vi.fn(),
    printWhoami: vi.fn(),
    getScheduleTasks: vi.fn(),
    readDeadlines: vi.fn(),
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
        getActiveSprint: mocks.getActiveSprint,
        addToSprint: mocks.addToSprint,
        createTasks: mocks.createTasks,
        closeTask: mocks.closeTask,
        setDueDate: mocks.setDueDate,
        getlinkedTasks: mocks.getlinkedTasks,
      }),
    },
  };
});

vi.mock('../../src/product-pages', () => {
  return {
    ProductPages: {
      getInstance: vi.fn().mockReturnValue({
        whoami: mocks.whoami,
        printWhoami: mocks.printWhoami,
        getScheduleTasks: mocks.getScheduleTasks,
      }),
    },
  };
});

vi.mock('../../src/schema/deadlines', async importOriginal => {
  const actual =
    await importOriginal<typeof import('../../src/schema/deadlines')>();
  return {
    ...actual,
    DEFAULT_DEADLINES_PATH: '/mock/deadlines.json',
    readDeadlines: mocks.readDeadlines,
  };
});

describe('runAuto()', () => {
  beforeEach(() => {
    vi.spyOn(process, 'exit').mockImplementation(mocks.processExit as never);
    mocks.getBoardIssues.mockResolvedValue([]);
    mocks.getActiveSprint.mockResolvedValue(undefined);
    mocks.addToSprint.mockResolvedValue(undefined);
    mocks.createTasks.mockResolvedValue(undefined);
    mocks.closeTask.mockResolvedValue(undefined);
    mocks.setDueDate.mockResolvedValue(undefined);
    mocks.getlinkedTasks.mockResolvedValue([]);
    mocks.whoami.mockResolvedValue({ username: 'testuser' });
    mocks.printWhoami.mockReturnValue(undefined);
    mocks.getScheduleTasks.mockResolvedValue([]);
    mocks.readDeadlines.mockReturnValue(null);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  const defaultOptions = {
    board: 123,
    team: 'team-foo',
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

  test('sets due date on preliminary testing split task for z-stream release', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2099-07-15'));

    mocks.getScheduleTasks.mockResolvedValue([
      {
        id: 1,
        name: 'Package Advisory REL_PREP Deadline',
        path: [],
        date_start: '2099-07-20',
        date_finish: '2099-07-20',
        release_shortname: 'rhel-9.8.z',
      },
    ]);

    mocks.getlinkedTasks.mockResolvedValue([
      {
        key: 'RHEL-9001',
        fields: {
          summary: '[Preliminary Testing Task]: RHEL-9000',
          status: { name: 'New' },
        },
      },
    ]);

    mocks.getBoardIssues.mockResolvedValue([
      {
        key: 'RHEL-9000',
        fields: {
          status: { name: 'New' },
          customfield_10879: { value: 'Requested' },
          fixVersions: [{ name: 'rhel-9.8.z' }],
          issuelinks: [],
        },
      },
    ]);

    await runAuto(defaultOptions);

    expect(mocks.createTasks).toHaveBeenCalledWith('RHEL-9000', ['14478']);
    expect(mocks.getlinkedTasks).toHaveBeenCalledWith('RHEL-9000', [
      'Preliminary Testing Task',
    ]);
    expect(mocks.setDueDate).toHaveBeenCalledWith('RHEL-9001', '2099-07-20');

    vi.useRealTimers();
  });

  test('sets due date on QE split task for z-stream release using closest REL_PREP', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2099-07-15'));

    mocks.getScheduleTasks.mockResolvedValue([
      {
        id: 1,
        name: 'Package Advisory REL_PREP Deadline',
        path: [],
        date_start: '2099-08-01',
        date_finish: '2099-08-01',
        release_shortname: 'rhel-9.8.z',
      },
    ]);

    mocks.getlinkedTasks.mockResolvedValue([
      {
        key: 'RHEL-9101',
        fields: {
          summary: '[QE Task]: RHEL-9100',
          status: { name: 'New' },
        },
      },
    ]);

    mocks.getBoardIssues.mockResolvedValue([
      {
        key: 'RHEL-9100',
        fields: {
          status: { name: 'Integration' },
          fixVersions: [{ name: 'rhel-9.8.z' }],
          issuelinks: [],
        },
      },
    ]);

    await runAuto(defaultOptions);

    expect(mocks.createTasks).toHaveBeenCalledWith('RHEL-9100', ['14480']);
    expect(mocks.getlinkedTasks).toHaveBeenCalledWith('RHEL-9100', ['QE Task']);
    expect(mocks.setDueDate).toHaveBeenCalledWith('RHEL-9101', '2099-08-01');

    vi.useRealTimers();
  });

  test('sets due date on preliminary testing split task for minor release using ITM_26', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2099-07-15'));

    mocks.getScheduleTasks.mockResolvedValue([
      {
        id: 1,
        name: 'ITM 26 DevTestDoc',
        path: [],
        date_start: '2099-07-20',
        date_finish: '2099-07-20',
        release_shortname: 'rhel-10.0',
      },
    ]);

    mocks.getlinkedTasks.mockResolvedValue([
      {
        key: 'RHEL-9201',
        fields: {
          summary: '[Preliminary Testing Task]: RHEL-9200',
          status: { name: 'New' },
        },
      },
    ]);

    mocks.getBoardIssues.mockResolvedValue([
      {
        key: 'RHEL-9200',
        fields: {
          status: { name: 'New' },
          customfield_10879: { value: 'Requested' },
          fixVersions: [{ name: 'rhel-10.0' }],
          issuelinks: [],
        },
      },
    ]);

    await runAuto(defaultOptions);

    expect(mocks.createTasks).toHaveBeenCalledWith('RHEL-9200', ['14478']);
    expect(mocks.setDueDate).toHaveBeenCalledWith('RHEL-9201', '2099-07-20');

    vi.useRealTimers();
  });

  test('does not set due date when no fixVersions on issue', async () => {
    mocks.getBoardIssues.mockResolvedValue([
      {
        key: 'RHEL-9300',
        fields: {
          status: { name: 'New' },
          customfield_10879: { value: 'Requested' },
          issuelinks: [],
        },
      },
    ]);

    await runAuto(defaultOptions);

    expect(mocks.createTasks).toHaveBeenCalledWith('RHEL-9300', ['14478']);
    expect(mocks.setDueDate).not.toHaveBeenCalled();
  });

  test('does not set due date when release has no deadlines data', async () => {
    mocks.whoami.mockRejectedValue(new Error('Kerberos unavailable'));
    mocks.readDeadlines.mockReturnValue(null);

    mocks.getBoardIssues.mockResolvedValue([
      {
        key: 'RHEL-9400',
        fields: {
          status: { name: 'New' },
          customfield_10879: { value: 'Requested' },
          fixVersions: [{ name: 'rhel-9.8.z' }],
          issuelinks: [],
        },
      },
    ]);

    await runAuto(defaultOptions);

    expect(mocks.createTasks).toHaveBeenCalledWith('RHEL-9400', ['14478']);
    expect(mocks.setDueDate).not.toHaveBeenCalled();
  });

  test('falls back to cached deadlines when PP is unavailable', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2099-07-15'));

    mocks.whoami.mockRejectedValue(new Error('Kerberos unavailable'));
    mocks.readDeadlines.mockReturnValue({
      updated_at: '2099-07-01T00:00:00.000Z',
      releases: {
        'rhel-9.8.z': {
          rel_prep: [{ name: 'REL_PREP', date_finish: '2099-07-20' }],
          itm_26: null,
        },
      },
    });

    mocks.getlinkedTasks.mockResolvedValue([
      {
        key: 'RHEL-9501',
        fields: {
          summary: '[Preliminary Testing Task]: RHEL-9500',
          status: { name: 'New' },
        },
      },
    ]);

    mocks.getBoardIssues.mockResolvedValue([
      {
        key: 'RHEL-9500',
        fields: {
          status: { name: 'New' },
          customfield_10879: { value: 'Requested' },
          fixVersions: [{ name: 'rhel-9.8.z' }],
          issuelinks: [],
        },
      },
    ]);

    await runAuto(defaultOptions);

    expect(mocks.createTasks).toHaveBeenCalledWith('RHEL-9500', ['14478']);
    expect(mocks.setDueDate).toHaveBeenCalledWith('RHEL-9501', '2099-07-20');

    vi.useRealTimers();
  });

  test('sets 2-week due date on split task when REL_PREP is far away', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2099-07-15'));

    mocks.getScheduleTasks.mockResolvedValue([
      {
        id: 1,
        name: 'Package Advisory REL_PREP Deadline',
        path: [],
        date_start: '2099-09-01',
        date_finish: '2099-09-01',
        release_shortname: 'rhel-9.8.z',
      },
    ]);

    mocks.getlinkedTasks.mockResolvedValue([
      {
        key: 'RHEL-9601',
        fields: {
          summary: '[Preliminary Testing Task]: RHEL-9600',
          status: { name: 'New' },
        },
      },
    ]);

    mocks.getBoardIssues.mockResolvedValue([
      {
        key: 'RHEL-9600',
        fields: {
          status: { name: 'New' },
          customfield_10879: { value: 'Requested' },
          fixVersions: [{ name: 'rhel-9.8.z' }],
          issuelinks: [],
        },
      },
    ]);

    await runAuto(defaultOptions);

    expect(mocks.setDueDate).toHaveBeenCalledWith('RHEL-9601', '2099-07-29');

    vi.useRealTimers();
  });

  describe('sprint assignment', () => {
    test('adds in-progress tasks without sprint to the active sprint', async () => {
      mocks.getActiveSprint.mockResolvedValue({
        id: 42,
        state: 'active',
        name: 'Sprint 10',
      });
      mocks.getBoardIssues.mockResolvedValueOnce([]).mockResolvedValueOnce([
        { key: 'RHEL-10000', fields: { status: { name: 'In Progress' } } },
        { key: 'RHEL-10001', fields: { status: { name: 'In Progress' } } },
      ]);

      await runAuto(defaultOptions);

      expect(mocks.getBoardIssues).toHaveBeenCalledTimes(2);
      expect(mocks.getBoardIssues).toHaveBeenNthCalledWith(
        2,
        123,
        expect.stringContaining('"AssignedTeam[Dropdown]" = "team-foo"')
      );
      expect(mocks.addToSprint).toHaveBeenCalledTimes(2);
      expect(mocks.addToSprint).toHaveBeenCalledWith('RHEL-10000', 42);
      expect(mocks.addToSprint).toHaveBeenCalledWith('RHEL-10001', 42);
    });

    test('skips sprint assignment when no active sprint is found', async () => {
      mocks.getActiveSprint.mockResolvedValue(undefined);
      mocks.getBoardIssues.mockResolvedValue([]);

      await runAuto(defaultOptions);

      expect(mocks.addToSprint).not.toHaveBeenCalled();
      expect(mocks.getBoardIssues).toHaveBeenCalledTimes(1);
    });

    test('skips tasks without a key during sprint assignment', async () => {
      mocks.getActiveSprint.mockResolvedValue({
        id: 42,
        state: 'active',
        name: 'Sprint 10',
      });
      mocks.getBoardIssues.mockResolvedValueOnce([]).mockResolvedValueOnce([
        { key: undefined, fields: { status: { name: 'In Progress' } } },
        { key: 'RHEL-10100', fields: { status: { name: 'In Progress' } } },
      ]);

      await runAuto(defaultOptions);

      expect(mocks.addToSprint).toHaveBeenCalledTimes(1);
      expect(mocks.addToSprint).toHaveBeenCalledWith('RHEL-10100', 42);
    });

    test('does nothing when no tasks match the sprint assignment JQL', async () => {
      mocks.getActiveSprint.mockResolvedValue({
        id: 42,
        state: 'active',
        name: 'Sprint 10',
      });
      mocks.getBoardIssues.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      await runAuto(defaultOptions);

      expect(mocks.addToSprint).not.toHaveBeenCalled();
    });

    test('uses the team option in the sprint assignment JQL', async () => {
      mocks.getActiveSprint.mockResolvedValue({
        id: 99,
        state: 'active',
        name: 'Sprint 5',
      });
      mocks.getBoardIssues.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      await runAuto({ ...defaultOptions, team: 'team-bar' });

      expect(mocks.getBoardIssues).toHaveBeenNthCalledWith(
        2,
        123,
        expect.stringContaining('"AssignedTeam[Dropdown]" = "team-bar"')
      );
    });
  });
});
