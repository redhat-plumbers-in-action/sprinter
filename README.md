# JIRA Sprinter

[![npm version][npm-status]][npm] [![Tests][test-status]][test] [![Linters][lint-status]][lint] [![CodeQL][codeql-status]][codeql] [![codecov][codecov-status]][codecov]

[npm]: https://www.npmjs.com/package/sprinter
[npm-status]: https://img.shields.io/npm/v/sprinter

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
> You can also set default values for the `assignee`, `board` in the `~/.config/jira-sprinter/.env` or `~/.env.jira-sprinter` file:
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
Usage: jira-sprinter [options]

🏃 Small CLI tool to manage sprints in JIRA Board

Options:
  -V, --version              output the version number
  -b, --board [board]        Jira Board ID
  -a, --assignee [assignee]  Jira Assignee (default: "<user-login>@redhat.com")
  -n, --nocolor              Disable color output (default: false)
  -x, --dry                  dry run
  -h, --help                 display help for command
```
