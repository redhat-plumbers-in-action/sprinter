# JIRA Sprinter

[![npm version][npm-status]][npm] [![Tests][test-status]][test] [![Linters][lint-status]][lint] [![CodeQL][codeql-status]][codeql] [![codecov][codecov-status]][codecov]

[npm]: https://www.npmjs.com/package/jira-sprinter
[npm-status]: https://img.shields.io/npm/v/jira-sprinter

[test]: https://github.com/redhat-plumbers-in-action/sprinter/actions/workflows/tests.yml
[test-status]: https://github.com/redhat-plumbers-in-action/sprinter/actions/workflows/tests.yml/badge.svg

[lint]: https://github.com/redhat-plumbers-in-action/sprinter/actions/workflows/lint.yml
[lint-status]: https://github.com/redhat-plumbers-in-action/sprinter/actions/workflows/lint.yml/badge.svg

[codeql]: https://github.com/redhat-plumbers-in-action/sprinter/actions/workflows/codeql-analysis.yml
[codeql-status]: https://github.com/redhat-plumbers-in-action/sprinter/actions/workflows/codeql-analysis.yml/badge.svg

[codecov]: https://codecov.io/gh/redhat-plumbers-in-action/sprinter
[codecov-status]: https://codecov.io/gh/redhat-plumbers-in-action/sprinter/graph/badge.svg?token=79yXVIeHyn

<!-- -->

## Description

Simple CLI tool that helps to manage sprints in JIRA Board.

## Usage

Make sure to store your JIRA Personal Access Token (PAT) in the `~/.config/jira-sprinter/.env` or `~/.env.jira-sprinter` file:

```bash
# ~/.config/jira-sprinter/.env
JIRA_API_TOKEN="exaple-token"
```

> [!TIP]
>
> You can also set default values for the `assignee`, `board` and more in the `~/.config/jira-sprinter/.env` or `~/.env.jira-sprinter` file:
>
> ```bash
> # ~/.config/jira-sprinter/.env
> ASSIGNEE="your-jira-username"
> BOARD="your-jira-board-id"
> ```

### Using Node.js

```bash
# run it using npx
npx jira-sprinter

# or install it globally using npm
npm install -g jira-sprinter
jira-sprinter
```

## How to use

> [!IMPORTANT]
>
> This tool is intended to be used by Red Hat employees on the Red Hat JIRA instance. It may be adapted to work with other JIRA instances in the future.

```md
$ jira-sprinter --help
Usage: jira-sprinter [options] [command]

🏃 Small CLI tool to manage sprints in JIRA Board

Options:
  -V, --version              output the version number
  -b, --board [board]        Jira Board ID
  -a, --assignee [assignee]  Jira Assignee (default: "<user-login>@redhat.com")
  -y, --yolo                 YOLO mode, dangerously skip all questions, apply
                             default values (use with caution!) (default: false)
  -n, --nocolor              Disable color output (default: false)
  -x, --dry                  dry run
  -h, --help                 display help for command

Commands:
  auto [options]             Automatically manages split tasks (Preliminary
                             Testing and QE) based on ticket state and status
```

### `auto` command

The `auto` command automates the management of split tasks based on ticket state and status. It performs the following actions:

- **Preliminary Testing Requested**: Scans the board for issues where Preliminary Testing is marked as "Requested" and creates the corresponding split task if one does not already exist (or was previously closed).
- **Preliminary Testing Failed**: When testing has failed, automatically closes the linked Preliminary Testing split task.
- **Integration without QE Task**: Finds issues in "Integration" status that lack an open QE Task and creates one automatically.
- **Release Pending with QE Task**: When an issue moves to "Release Pending" status, automatically closes the linked QE Task if it is still open.

```md
$ jira-sprinter auto --help
Usage: jira-sprinter auto [options]

Automatically manages split tasks (Preliminary Testing and QE) based on ticket
state and status

Options:
  -b, --board [board]            Jira Board ID
  -t, --team [assigned team]     Jira Assigned Team
  -c, --components [components]  Jira Components
  -h, --help                     display help for command
```

## Systemd Timer

You can run the `auto` command on a schedule using the provided systemd units in `systemd/`.

### Setup

1. Edit `systemd/jira-sprinter.service` and set the correct paths:

   - `EnvironmentFile=` -- path to the `.env` file containing `JIRA_API_TOKEN`
   - `ExecStart=` -- path to the `jira-sprinter` command with the required arguments

2. Copy the units to your user systemd directory:

   ```bash
   mkdir -p ~/.config/systemd/user
   cp systemd/jira-sprinter.service ~/.config/systemd/user/
   cp systemd/jira-sprinter.timer ~/.config/systemd/user/
   ```

3. Reload systemd, enable and start the timer:

   ```bash
   systemctl --user daemon-reload
   systemctl --user enable --now jira-sprinter.timer
   ```

4. Verify the timer is active:

   ```bash
   systemctl --user status jira-sprinter.timer
   systemctl --user list-timers
   ```

The timer fires every 20 minutes (at :00, :20, and :40). The service uses `Type=oneshot`, so systemd will never start a second instance if a previous run is still in progress.
