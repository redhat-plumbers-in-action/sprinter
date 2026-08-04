import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { runPpSync } from '../../src/pp-sync';

const mocks = vi.hoisted(() => {
  return {
    whoami: vi.fn(),
    getScheduleTasks: vi.fn(),
    readDeadlines: vi.fn(),
    writeDeadlines: vi.fn(),
  };
});

vi.mock('../../src/product-pages', () => {
  return {
    ProductPages: {
      getInstance: vi.fn().mockReturnValue({
        whoami: mocks.whoami,
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
    writeDeadlines: mocks.writeDeadlines,
  };
});

describe('runPpSync()', () => {
  beforeEach(() => {
    mocks.whoami.mockResolvedValue({ username: 'testuser' });
    mocks.getScheduleTasks.mockResolvedValue([]);
    mocks.readDeadlines.mockReturnValue(null);
    mocks.writeDeadlines.mockReturnValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  const defaultOptions = {
    dry: false,
    nocolor: true,
  };

  test('calls whoami to verify authentication', async () => {
    await runPpSync(['fake-product-1.0'], defaultOptions);

    expect(mocks.whoami).toHaveBeenCalledTimes(1);
  });

  test('fetches schedule tasks for each release', async () => {
    mocks.getScheduleTasks.mockResolvedValue([]);

    await runPpSync(['fake-product-1.0', 'fake-product-2.0.z'], defaultOptions);

    expect(mocks.getScheduleTasks).toHaveBeenCalledTimes(2);
    expect(mocks.getScheduleTasks).toHaveBeenCalledWith('fake-product-1.0', {
      name__regex: '.*(Package Advisory REL_PREP Deadline|ITM 26 DevTestDoc).*',
    });
    expect(mocks.getScheduleTasks).toHaveBeenCalledWith('fake-product-2.0.z', {
      name__regex: '.*(Package Advisory REL_PREP Deadline|ITM 26 DevTestDoc).*',
    });
  });

  test('extracts rel_prep and itm_26 from schedule tasks', async () => {
    mocks.getScheduleTasks.mockResolvedValue([
      {
        id: 1,
        name: 'Package Advisory REL_PREP Deadline',
        path: [],
        date_start: '2099-10-01',
        date_finish: '2099-10-15',
        release_shortname: 'fake-product-1.0',
      },
      {
        id: 2,
        name: 'ITM 26 DevTestDoc',
        path: [],
        date_start: '2099-08-01',
        date_finish: '2099-09-01',
        release_shortname: 'fake-product-1.0',
      },
    ]);

    await runPpSync(['fake-product-1.0'], defaultOptions);

    expect(mocks.writeDeadlines).toHaveBeenCalledTimes(1);
    const writtenData = mocks.writeDeadlines.mock.calls[0][0];
    expect(writtenData.releases['fake-product-1.0']).toEqual({
      rel_prep: [
        {
          name: 'Package Advisory REL_PREP Deadline',
          date_finish: '2099-10-15',
        },
      ],
      itm_26: '2099-09-01',
    });
  });

  test('collects multiple REL_PREP entries', async () => {
    mocks.getScheduleTasks.mockResolvedValue([
      {
        id: 1,
        name: 'Package Advisory REL_PREP Deadline (batch 1)',
        path: [],
        date_start: '2099-09-01',
        date_finish: '2099-09-15',
        release_shortname: 'fake-product-1.0',
      },
      {
        id: 2,
        name: 'Package Advisory REL_PREP Deadline (batch 2)',
        path: [],
        date_start: '2099-10-01',
        date_finish: '2099-10-15',
        release_shortname: 'fake-product-1.0',
      },
      {
        id: 3,
        name: 'Package Advisory REL_PREP Deadline (batch 3)',
        path: [],
        date_start: '2099-11-01',
        date_finish: '2099-11-15',
        release_shortname: 'fake-product-1.0',
      },
    ]);

    await runPpSync(['fake-product-1.0'], defaultOptions);

    const writtenData = mocks.writeDeadlines.mock.calls[0][0];
    expect(writtenData.releases['fake-product-1.0'].rel_prep).toEqual([
      {
        name: 'Package Advisory REL_PREP Deadline (batch 1)',
        date_finish: '2099-09-15',
      },
      {
        name: 'Package Advisory REL_PREP Deadline (batch 2)',
        date_finish: '2099-10-15',
      },
      {
        name: 'Package Advisory REL_PREP Deadline (batch 3)',
        date_finish: '2099-11-15',
      },
    ]);
  });

  test('sets null for itm_26 when not found, empty array for rel_prep', async () => {
    mocks.getScheduleTasks.mockResolvedValue([
      {
        id: 1,
        name: 'Package Advisory REL_PREP Deadline',
        path: [],
        date_start: '2099-10-01',
        date_finish: '2099-10-15',
        release_shortname: 'fake-product-2.0.z',
      },
    ]);

    await runPpSync(['fake-product-2.0.z'], defaultOptions);

    const writtenData = mocks.writeDeadlines.mock.calls[0][0];
    expect(writtenData.releases['fake-product-2.0.z']).toEqual({
      rel_prep: [
        {
          name: 'Package Advisory REL_PREP Deadline',
          date_finish: '2099-10-15',
        },
      ],
      itm_26: null,
    });
  });

  test('sets empty array and null when no schedule tasks match', async () => {
    mocks.getScheduleTasks.mockResolvedValue([]);

    await runPpSync(['fake-product-3.0'], defaultOptions);

    const writtenData = mocks.writeDeadlines.mock.calls[0][0];
    expect(writtenData.releases['fake-product-3.0']).toEqual({
      rel_prep: [],
      itm_26: null,
    });
  });

  test('merges with existing deadlines file preserving other releases', async () => {
    mocks.readDeadlines.mockReturnValue({
      updated_at: '2099-01-01T00:00:00.000Z',
      releases: {
        'fake-product-0.9': {
          rel_prep: [
            { name: 'Old REL_PREP Deadline', date_finish: '2099-03-20' },
          ],
          itm_26: '2099-02-15',
        },
      },
    });

    mocks.getScheduleTasks.mockResolvedValue([
      {
        id: 1,
        name: 'Package Advisory REL_PREP Deadline',
        path: [],
        date_start: '2099-10-01',
        date_finish: '2099-10-15',
        release_shortname: 'fake-product-1.0',
      },
    ]);

    await runPpSync(['fake-product-1.0'], defaultOptions);

    const writtenData = mocks.writeDeadlines.mock.calls[0][0];
    expect(writtenData.releases['fake-product-0.9']).toEqual({
      rel_prep: [{ name: 'Old REL_PREP Deadline', date_finish: '2099-03-20' }],
      itm_26: '2099-02-15',
    });
    expect(writtenData.releases['fake-product-1.0']).toEqual({
      rel_prep: [
        {
          name: 'Package Advisory REL_PREP Deadline',
          date_finish: '2099-10-15',
        },
      ],
      itm_26: null,
    });
  });

  test('overwrites existing release entry on re-sync', async () => {
    mocks.readDeadlines.mockReturnValue({
      updated_at: '2099-01-01T00:00:00.000Z',
      releases: {
        'fake-product-1.0': {
          rel_prep: [
            { name: 'Old REL_PREP Deadline', date_finish: '2099-10-01' },
          ],
          itm_26: null,
        },
      },
    });

    mocks.getScheduleTasks.mockResolvedValue([
      {
        id: 1,
        name: 'Package Advisory REL_PREP Deadline',
        path: [],
        date_start: '2099-10-01',
        date_finish: '2099-10-20',
        release_shortname: 'fake-product-1.0',
      },
      {
        id: 2,
        name: 'ITM 26 DevTestDoc',
        path: [],
        date_start: '2099-08-01',
        date_finish: '2099-09-05',
        release_shortname: 'fake-product-1.0',
      },
    ]);

    await runPpSync(['fake-product-1.0'], defaultOptions);

    const writtenData = mocks.writeDeadlines.mock.calls[0][0];
    expect(writtenData.releases['fake-product-1.0']).toEqual({
      rel_prep: [
        {
          name: 'Package Advisory REL_PREP Deadline',
          date_finish: '2099-10-20',
        },
      ],
      itm_26: '2099-09-05',
    });
  });

  test('sets updated_at timestamp', async () => {
    const before = new Date().toISOString();

    await runPpSync(['fake-product-1.0'], defaultOptions);

    const after = new Date().toISOString();
    const writtenData = mocks.writeDeadlines.mock.calls[0][0];
    expect(writtenData.updated_at >= before).toBe(true);
    expect(writtenData.updated_at <= after).toBe(true);
  });

  test('does not write file in dry-run mode', async () => {
    await runPpSync(['fake-product-1.0'], { ...defaultOptions, dry: true });

    expect(mocks.writeDeadlines).not.toHaveBeenCalled();
  });

  test('still fetches data in dry-run mode', async () => {
    await runPpSync(['fake-product-1.0'], { ...defaultOptions, dry: true });

    expect(mocks.whoami).toHaveBeenCalledTimes(1);
    expect(mocks.getScheduleTasks).toHaveBeenCalledTimes(1);
  });

  test('uses custom deadlines file path when provided', async () => {
    await runPpSync(['fake-product-1.0'], {
      ...defaultOptions,
      deadlinesFile: '/custom/path/deadlines.json',
    });

    expect(mocks.readDeadlines).toHaveBeenCalledWith(
      '/custom/path/deadlines.json'
    );
    expect(mocks.writeDeadlines).toHaveBeenCalledWith(
      expect.any(Object),
      '/custom/path/deadlines.json'
    );
  });

  test('uses default path when deadlinesFile option is not set', async () => {
    await runPpSync(['fake-product-1.0'], defaultOptions);

    expect(mocks.readDeadlines).toHaveBeenCalledWith('/mock/deadlines.json');
    expect(mocks.writeDeadlines).toHaveBeenCalledWith(
      expect.any(Object),
      '/mock/deadlines.json'
    );
  });

  test('handles multiple releases in a single sync', async () => {
    mocks.getScheduleTasks
      .mockResolvedValueOnce([
        {
          id: 1,
          name: 'Package Advisory REL_PREP Deadline',
          path: [],
          date_start: '2099-10-01',
          date_finish: '2099-10-15',
          release_shortname: 'fake-product-1.0',
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 2,
          name: 'ITM 26 DevTestDoc',
          path: [],
          date_start: '2099-08-01',
          date_finish: '2099-09-01',
          release_shortname: 'fake-product-2.0.z',
        },
      ])
      .mockResolvedValueOnce([]);

    await runPpSync(
      ['fake-product-1.0', 'fake-product-2.0.z', 'fake-product-3.0'],
      defaultOptions
    );

    expect(mocks.getScheduleTasks).toHaveBeenCalledTimes(3);
    expect(mocks.writeDeadlines).toHaveBeenCalledTimes(1);

    const writtenData = mocks.writeDeadlines.mock.calls[0][0];
    expect(writtenData.releases).toEqual({
      'fake-product-1.0': {
        rel_prep: [
          {
            name: 'Package Advisory REL_PREP Deadline',
            date_finish: '2099-10-15',
          },
        ],
        itm_26: null,
      },
      'fake-product-2.0.z': { rel_prep: [], itm_26: '2099-09-01' },
      'fake-product-3.0': { rel_prep: [], itm_26: null },
    });
  });

  test('handles no existing deadlines file gracefully', async () => {
    mocks.readDeadlines.mockReturnValue(null);
    mocks.getScheduleTasks.mockResolvedValue([]);

    await runPpSync(['fake-product-1.0'], defaultOptions);

    expect(mocks.writeDeadlines).toHaveBeenCalledTimes(1);
    const writtenData = mocks.writeDeadlines.mock.calls[0][0];
    expect(writtenData.releases['fake-product-1.0']).toEqual({
      rel_prep: [],
      itm_26: null,
    });
  });
});
