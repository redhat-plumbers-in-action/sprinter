import { describe, expect, test } from 'vitest';

import {
  closestFutureDate,
  computePreliminaryTestingDueDate,
  computeQeTaskDueDate,
  type ReleaseDeadlines,
} from '../../src/schema/deadlines';

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
    };
    expect(computePreliminaryTestingDueDate(deadlines, true, today)).toBe(
      '2099-07-29'
    );
  });

  test('z-stream: returns REL_PREP when it is sooner than 2 weeks', () => {
    const deadlines: ReleaseDeadlines = {
      rel_prep: [{ name: 'REL_PREP', date_finish: '2099-07-20' }],
      itm_26: null,
    };
    expect(computePreliminaryTestingDueDate(deadlines, true, today)).toBe(
      '2099-07-20'
    );
  });

  test('z-stream: returns 2 weeks when REL_PREP is exactly 2 weeks away', () => {
    const deadlines: ReleaseDeadlines = {
      rel_prep: [{ name: 'REL_PREP', date_finish: '2099-07-29' }],
      itm_26: null,
    };
    expect(computePreliminaryTestingDueDate(deadlines, true, today)).toBe(
      '2099-07-29'
    );
  });

  test('z-stream: returns 2 weeks when no REL_PREP entries exist', () => {
    const deadlines: ReleaseDeadlines = {
      rel_prep: [],
      itm_26: null,
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
    };
    expect(computePreliminaryTestingDueDate(deadlines, true, today)).toBe(
      '2099-07-18'
    );
  });

  test('minor: returns 2 weeks when ITM_26 is far away', () => {
    const deadlines: ReleaseDeadlines = {
      rel_prep: [],
      itm_26: '2099-09-01',
    };
    expect(computePreliminaryTestingDueDate(deadlines, false, today)).toBe(
      '2099-07-29'
    );
  });

  test('minor: returns ITM_26 when it is sooner than 2 weeks', () => {
    const deadlines: ReleaseDeadlines = {
      rel_prep: [],
      itm_26: '2099-07-22',
    };
    expect(computePreliminaryTestingDueDate(deadlines, false, today)).toBe(
      '2099-07-22'
    );
  });

  test('minor: returns 2 weeks when ITM_26 is null', () => {
    const deadlines: ReleaseDeadlines = {
      rel_prep: [],
      itm_26: null,
    };
    expect(computePreliminaryTestingDueDate(deadlines, false, today)).toBe(
      '2099-07-29'
    );
  });

  test('minor: returns 2 weeks when ITM_26 is in the past', () => {
    const deadlines: ReleaseDeadlines = {
      rel_prep: [],
      itm_26: '2099-07-01',
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
    };
    expect(computeQeTaskDueDate(deadlines, true, today)).toBe('2099-08-01');
  });

  test('z-stream: returns null when no future REL_PREP exists', () => {
    const deadlines: ReleaseDeadlines = {
      rel_prep: [{ name: 'REL_PREP', date_finish: '2099-06-01' }],
      itm_26: null,
    };
    expect(computeQeTaskDueDate(deadlines, true, today)).toBeNull();
  });

  test('z-stream: returns null when rel_prep is empty', () => {
    const deadlines: ReleaseDeadlines = {
      rel_prep: [],
      itm_26: null,
    };
    expect(computeQeTaskDueDate(deadlines, true, today)).toBeNull();
  });

  test('minor: returns ITM_26 when it is in the future', () => {
    const deadlines: ReleaseDeadlines = {
      rel_prep: [],
      itm_26: '2099-09-01',
    };
    expect(computeQeTaskDueDate(deadlines, false, today)).toBe('2099-09-01');
  });

  test('minor: returns null when ITM_26 is null', () => {
    const deadlines: ReleaseDeadlines = {
      rel_prep: [],
      itm_26: null,
    };
    expect(computeQeTaskDueDate(deadlines, false, today)).toBeNull();
  });

  test('minor: returns null when ITM_26 is in the past', () => {
    const deadlines: ReleaseDeadlines = {
      rel_prep: [],
      itm_26: '2099-06-01',
    };
    expect(computeQeTaskDueDate(deadlines, false, today)).toBeNull();
  });

  test('minor: returns ITM_26 when it is today', () => {
    const deadlines: ReleaseDeadlines = {
      rel_prep: [],
      itm_26: '2099-07-15',
    };
    expect(computeQeTaskDueDate(deadlines, false, today)).toBe('2099-07-15');
  });
});
