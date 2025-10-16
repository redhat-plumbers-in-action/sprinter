import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { cli } from '../../src/cli';

const mocks = vi.hoisted(() => {
  return {
    os: {
      userInfo: vi.fn(),
    },
  };
});

vi.mock('node:os', () => {
  return {
    default: mocks.os,
  };
});

describe('CLI functions', () => {
  beforeEach(async () => {
    mocks.os.userInfo.mockReturnValue({
      username: 'username',
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  test(`cli()`, () => {
    vi.stubEnv('COMPONENT', 'component');

    const program = cli();

    expect(program.name()).toBe('jira-sprinter');
    expect(program.description()).toBe(
      '🏃 Small CLI tool to manage sprints in JIRA Board'
    );

    program.parse();
    expect(program.opts()).toMatchInlineSnapshot(`
      {
        "assignee": "username@redhat.com",
        "nocolor": false,
      }
    `);

    expect(program.helpInformation()).toMatchInlineSnapshot(`
      "Usage: jira-sprinter [options]

      🏃 Small CLI tool to manage sprints in JIRA Board

      Options:
        -V, --version              output the version number
        -b, --board [board]        Jira Board ID
        -a, --assignee [assignee]  Jira Assignee (default: "username@redhat.com")
        -n, --nocolor              Disable color output (default: false)
        -x, --dry                  dry run
        -h, --help                 display help for command
      "
    `);
  });
});
