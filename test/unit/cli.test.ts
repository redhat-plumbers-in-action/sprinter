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

  test(`cli: jira-sprinter command`, () => {
    vi.stubEnv('COMPONENT', 'component');

    const program = cli();
    program.exitOverride();
    program.configureOutput({ writeOut: () => {}, writeErr: () => {} });

    expect(program.name()).toBe('jira-sprinter');
    expect(program.description()).toBe(
      '🏃 Small CLI tool to manage sprints in JIRA Board'
    );

    expect(() => program.parse(['node', 'jira-sprinter', '--help'])).toThrow();
    expect(program.opts()).toMatchInlineSnapshot(`
      {
        "assignee": "username@redhat.com",
        "nocolor": false,
        "yolo": false,
      }
    `);

    expect(program.helpInformation()).toMatchInlineSnapshot(`
      "Usage: jira-sprinter [options] [command]

      🏃 Small CLI tool to manage sprints in JIRA Board

      Options:
        -V, --version              output the version number
        -b, --board [board]        Jira Board ID
        -a, --assignee [assignee]  Jira Assignee (default: "username@redhat.com")
        -y, --yolo                 YOLO mode, dangerously skip all questions, apply
                                   default values (use with caution!) (default: false)
        -n, --nocolor              Disable color output (default: false)
        -x, --dry                  dry run
        -h, --help                 display help for command

      Commands:
        auto [options]             Automatically manages split tasks (Preliminary
                                   Testing and QE) based on ticket state and status
      "
    `);
  });

  test(`cli: auto command`, () => {
    vi.stubEnv('COMPONENT', 'component');

    const program = cli();
    program.exitOverride();
    program.configureOutput({ writeOut: () => {}, writeErr: () => {} });

    expect(() =>
      program.parse(['node', 'jira-sprinter', 'auto', '--help'])
    ).toThrow();

    const autoCmd = program.commands.find(c => c.name() === 'auto')!;
    expect(autoCmd.helpInformation()).toMatchInlineSnapshot(`
      "Usage: jira-sprinter auto [options]

      Automatically manages split tasks (Preliminary Testing and QE) based on ticket
      state and status

      Options:
        -b, --board [board]            Jira Board ID
        -t, --team [assigned team]     Jira Assigned Team
        -c, --components [components]  Jira Components
        -h, --help                     display help for command
      "
    `);
  });
});
