import { describe, expect, test } from 'vitest';

import {
  classifyScheduleTasks,
  closestFutureDate,
  computePreliminaryTestingDueDate,
  computeQeTaskDueDate,
  escapeRegex,
  type ReleaseDeadlines,
} from '../../src/schema/deadlines';

describe('escapeRegex()', () => {
  test('escapes regex metacharacters', () => {
    expect(escapeRegex('a.b*c+d?e')).toBe('a\\.b\\*c\\+d\\?e');
  });

  test('escapes parentheses, brackets, and braces', () => {
    expect(escapeRegex('(a)[b]{c}')).toBe('\\(a\\)\\[b\\]\\{c\\}');
  });

  test('escapes anchors and pipe', () => {
    expect(escapeRegex('^start|end$')).toBe('\\^start\\|end\\$');
  });

  test('escapes backslash', () => {
    expect(escapeRegex('a\\b')).toBe('a\\\\b');
  });

  test('returns plain strings unchanged', () => {
    expect(escapeRegex('hello world')).toBe('hello world');
  });

  test('handles the All built REL_PREP task name', () => {
    const input = 'All packages built & All Errata in REL_PREP (non-container)';
    const escaped = escapeRegex(input);
    expect(escaped).toBe(
      'All packages built & All Errata in REL_PREP \\(non-container\\)'
    );
    expect(new RegExp(escaped).test(input)).toBe(true);
  });
});

describe('closestFutureDate()', () => {
  const today = new Date('2099-07-15');

  test('returns the nearest future date', () => {
    expect(
      closestFutureDate(['2099-08-01', '2099-09-01', '2099-10-01'], today)
    ).toBe('2099-08-01');
  });

  test('returns today if it matches a date', () => {
    expect(closestFutureDate(['2099-07-15', '2099-09-01'], today)).toBe(
      '2099-07-15'
    );
  });

  test('returns null when all dates are in the past', () => {
    expect(closestFutureDate(['2099-06-01', '2099-07-01'], today)).toBeNull();
  });

  test('returns null for an empty array', () => {
    expect(closestFutureDate([], today)).toBeNull();
  });

  test('skips past dates and returns first future one', () => {
    expect(
      closestFutureDate(['2099-06-01', '2099-07-20', '2099-08-01'], today)
    ).toBe('2099-07-20');
  });
});

describe('computePreliminaryTestingDueDate()', () => {
  const today = new Date('2099-07-15');

  test('z-stream: returns 2 weeks when REL_PREP is far away', () => {
    const deadlines: ReleaseDeadlines = {
      rel_prep: [{ name: 'REL_PREP', date_finish: '2099-09-01' }],
      itm_26: null,
      all_built_rel_prep: null,
    };
    expect(computePreliminaryTestingDueDate(deadlines, true, today)).toBe(
      '2099-07-29'
    );
  });

  test('z-stream: returns REL_PREP when it is sooner than 2 weeks', () => {
    const deadlines: ReleaseDeadlines = {
      rel_prep: [{ name: 'REL_PREP', date_finish: '2099-07-20' }],
      itm_26: null,
      all_built_rel_prep: null,
    };
    expect(computePreliminaryTestingDueDate(deadlines, true, today)).toBe(
      '2099-07-20'
    );
  });

  test('z-stream: returns 2 weeks when REL_PREP is exactly 2 weeks away', () => {
    const deadlines: ReleaseDeadlines = {
      rel_prep: [{ name: 'REL_PREP', date_finish: '2099-07-29' }],
      itm_26: null,
      all_built_rel_prep: null,
    };
    expect(computePreliminaryTestingDueDate(deadlines, true, today)).toBe(
      '2099-07-29'
    );
  });

  test('z-stream: returns 2 weeks when no REL_PREP entries exist', () => {
    const deadlines: ReleaseDeadlines = {
      rel_prep: [],
      itm_26: null,
      all_built_rel_prep: null,
    };
    expect(computePreliminaryTestingDueDate(deadlines, true, today)).toBe(
      '2099-07-29'
    );
  });

  test('z-stream: picks closest future REL_PREP among multiple', () => {
    const deadlines: ReleaseDeadlines = {
      rel_prep: [
        { name: 'REL_PREP batch 1', date_finish: '2099-07-18' },
        { name: 'REL_PREP batch 2', date_finish: '2099-08-15' },
      ],
      itm_26: null,
      all_built_rel_prep: null,
    };
    expect(computePreliminaryTestingDueDate(deadlines, true, today)).toBe(
      '2099-07-18'
    );
  });

  test('minor: returns 2 weeks when ITM_26 is far away', () => {
    const deadlines: ReleaseDeadlines = {
      rel_prep: [],
      itm_26: '2099-09-01',
      all_built_rel_prep: null,
    };
    expect(computePreliminaryTestingDueDate(deadlines, false, today)).toBe(
      '2099-07-29'
    );
  });

  test('minor: returns ITM_26 when it is sooner than 2 weeks', () => {
    const deadlines: ReleaseDeadlines = {
      rel_prep: [],
      itm_26: '2099-07-22',
      all_built_rel_prep: null,
    };
    expect(computePreliminaryTestingDueDate(deadlines, false, today)).toBe(
      '2099-07-22'
    );
  });

  test('minor: returns 1 week when ITM_26 is null (past ITM 26)', () => {
    const deadlines: ReleaseDeadlines = {
      rel_prep: [],
      itm_26: null,
      all_built_rel_prep: null,
    };
    expect(computePreliminaryTestingDueDate(deadlines, false, today)).toBe(
      '2099-07-22'
    );
  });

  test('minor: returns 1 week when ITM_26 is in the past', () => {
    const deadlines: ReleaseDeadlines = {
      rel_prep: [],
      itm_26: '2099-07-01',
      all_built_rel_prep: null,
    };
    expect(computePreliminaryTestingDueDate(deadlines, false, today)).toBe(
      '2099-07-22'
    );
  });

  test('minor: returns all_built_rel_prep when ITM_26 is in the past and all_built_rel_prep is within 1 week', () => {
    const deadlines: ReleaseDeadlines = {
      rel_prep: [],
      itm_26: '2099-07-01',
      all_built_rel_prep: '2099-07-20',
    };
    expect(computePreliminaryTestingDueDate(deadlines, false, today)).toBe(
      '2099-07-20'
    );
  });

  test('minor: returns 1 week when ITM_26 is in the past and all_built_rel_prep is far away', () => {
    const deadlines: ReleaseDeadlines = {
      rel_prep: [],
      itm_26: '2099-07-01',
      all_built_rel_prep: '2099-09-01',
    };
    expect(computePreliminaryTestingDueDate(deadlines, false, today)).toBe(
      '2099-07-22'
    );
  });

  test('minor: returns all_built_rel_prep when ITM_26 is null and all_built_rel_prep is within 1 week', () => {
    const deadlines: ReleaseDeadlines = {
      rel_prep: [],
      itm_26: null,
      all_built_rel_prep: '2099-07-20',
    };
    expect(computePreliminaryTestingDueDate(deadlines, false, today)).toBe(
      '2099-07-20'
    );
  });

  test('minor: returns 2 weeks when ITM_26 is in the future but far away', () => {
    const deadlines: ReleaseDeadlines = {
      rel_prep: [],
      itm_26: '2099-09-01',
      all_built_rel_prep: null,
    };
    expect(computePreliminaryTestingDueDate(deadlines, false, today)).toBe(
      '2099-07-29'
    );
  });
});

describe('computeQeTaskDueDate()', () => {
  const today = new Date('2099-07-15');

  test('z-stream: returns closest future REL_PREP', () => {
    const deadlines: ReleaseDeadlines = {
      rel_prep: [
        { name: 'REL_PREP batch 1', date_finish: '2099-08-01' },
        { name: 'REL_PREP batch 2', date_finish: '2099-09-01' },
      ],
      itm_26: null,
      all_built_rel_prep: null,
    };
    expect(computeQeTaskDueDate(deadlines, true, today)).toBe('2099-08-01');
  });

  test('z-stream: returns null when no future REL_PREP exists', () => {
    const deadlines: ReleaseDeadlines = {
      rel_prep: [{ name: 'REL_PREP', date_finish: '2099-06-01' }],
      itm_26: null,
      all_built_rel_prep: null,
    };
    expect(computeQeTaskDueDate(deadlines, true, today)).toBeNull();
  });

  test('z-stream: returns null when rel_prep is empty', () => {
    const deadlines: ReleaseDeadlines = {
      rel_prep: [],
      itm_26: null,
      all_built_rel_prep: null,
    };
    expect(computeQeTaskDueDate(deadlines, true, today)).toBeNull();
  });

  test('minor: returns ITM_26 when it is in the future', () => {
    const deadlines: ReleaseDeadlines = {
      rel_prep: [],
      itm_26: '2099-09-01',
      all_built_rel_prep: null,
    };
    expect(computeQeTaskDueDate(deadlines, false, today)).toBe('2099-09-01');
  });

  test('minor: returns null when ITM_26 is null', () => {
    const deadlines: ReleaseDeadlines = {
      rel_prep: [],
      itm_26: null,
      all_built_rel_prep: null,
    };
    expect(computeQeTaskDueDate(deadlines, false, today)).toBeNull();
  });

  test('minor: returns null when ITM_26 is in the past', () => {
    const deadlines: ReleaseDeadlines = {
      rel_prep: [],
      itm_26: '2099-06-01',
      all_built_rel_prep: null,
    };
    expect(computeQeTaskDueDate(deadlines, false, today)).toBeNull();
  });

  test('minor: returns ITM_26 when it is today', () => {
    const deadlines: ReleaseDeadlines = {
      rel_prep: [],
      itm_26: '2099-07-15',
      all_built_rel_prep: null,
    };
    expect(computeQeTaskDueDate(deadlines, false, today)).toBe('2099-07-15');
  });

  test('minor: returns all_built_rel_prep when ITM_26 is in the past', () => {
    const deadlines: ReleaseDeadlines = {
      rel_prep: [],
      itm_26: '2099-06-01',
      all_built_rel_prep: '2099-09-01',
    };
    expect(computeQeTaskDueDate(deadlines, false, today)).toBe('2099-09-01');
  });

  test('minor: returns all_built_rel_prep when ITM_26 is null', () => {
    const deadlines: ReleaseDeadlines = {
      rel_prep: [],
      itm_26: null,
      all_built_rel_prep: '2099-08-15',
    };
    expect(computeQeTaskDueDate(deadlines, false, today)).toBe('2099-08-15');
  });

  test('minor: returns null when both ITM_26 and all_built_rel_prep are in the past', () => {
    const deadlines: ReleaseDeadlines = {
      rel_prep: [],
      itm_26: '2099-06-01',
      all_built_rel_prep: '2099-07-01',
    };
    expect(computeQeTaskDueDate(deadlines, false, today)).toBeNull();
  });

  test('minor: prefers ITM_26 over all_built_rel_prep when both are in the future', () => {
    const deadlines: ReleaseDeadlines = {
      rel_prep: [],
      itm_26: '2099-08-01',
      all_built_rel_prep: '2099-09-01',
    };
    expect(computeQeTaskDueDate(deadlines, false, today)).toBe('2099-08-01');
  });
});

describe('classifyScheduleTasks()', () => {
  test('classifies "All packages built & All Errata in REL_PREP (non-container)" separately', () => {
    const result = classifyScheduleTasks([
      {
        name: 'Package Advisory REL_PREP Deadline',
        date_finish: '2099-08-01',
      },
      {
        name: 'ITM 26 DevTestDoc',
        date_finish: '2099-07-20',
      },
      {
        name: 'All packages built & All Errata in REL_PREP (non-container)',
        date_finish: '2099-09-15',
      },
    ]);

    expect(result.rel_prep).toEqual([
      { name: 'Package Advisory REL_PREP Deadline', date_finish: '2099-08-01' },
    ]);
    expect(result.itm_26).toBe('2099-07-20');
    expect(result.all_built_rel_prep).toBe('2099-09-15');
  });

  test('returns null for all_built_rel_prep when task is not present', () => {
    const result = classifyScheduleTasks([
      {
        name: 'Package Advisory REL_PREP Deadline',
        date_finish: '2099-08-01',
      },
    ]);

    expect(result.rel_prep).toHaveLength(1);
    expect(result.all_built_rel_prep).toBeNull();
  });
});
