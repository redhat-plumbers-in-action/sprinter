import chalk from 'chalk';
import { Command } from 'commander';
import select, { Separator } from '@inquirer/select';
import checkbox from '@inquirer/checkbox';

import { Jira } from './jira';
import { Logger } from './logger';
import { getDefaultValue, getOptions, raise, tokenUnavailable } from './util';

import { SearchResults } from 'jira.js/dist/esm/types/agile/models';
import {
  colorTaskSchema,
  issueStatusSchema,
  issueTypeSchema,
  colorSizeSchema,
  Size,
} from './schema/jira';
import { Issue } from 'jira.js/dist/esm/types/version2/models';

export function cli(): Command {
  const program = new Command();

  program
    .name('jira-sprinter')
    .description('🏃 Small CLI tool to manage sprints in JIRA Board')
    .version('1.0.0');

  program
    .option('-b, --board [board]', 'Jira Board ID', getDefaultValue('BOARD'))
    .option(
      '-a, --assignee [assignee]',
      'Jira Assignee',
      getDefaultValue('ASSIGNEE')
    )
    .option('-n, --nocolor', 'Disable color output', getDefaultValue('NOCOLOR'))
    .option('-x, --dry', 'dry run', getDefaultValue('DRY'));

  return program;
}

const runProgram = async () => {
  const program = cli();
  program.parse();

  const options = getOptions(program.opts());
  const logger = new Logger(!!options.nocolor);

  const token = process.env.JIRA_API_TOKEN ?? tokenUnavailable();
  const jira = new Jira(
    'https://issues.redhat.com',
    token,
    options.dry,
    logger
  );

  const version = await jira.getVersion();
  console.debug(`JIRA Version: ${version}`);

  const sprints = await jira.getSprints(+options.board);

  const sprintOrBacklog = await select({
    message: 'Pick issues to process from sprint or backlog',
    choices: [
      ...sprints.map(sprint => ({
        name: `${sprint.name} (${sprint.state === 'active' ? chalk.green(sprint.state) : chalk.yellow(sprint.state)})`,
        value: sprint.id,
      })),
      {
        name: `${chalk.bold('Backlog')}`,
        disabled: true,
        value: -1,
      },
    ],
    default: sprints.find(sprint => sprint.state === 'future')?.id ?? undefined,
    pageSize: 5,
    loop: false,
  });

  let issues: SearchResults['issues'] = [];
  if (sprintOrBacklog === -1) {
    issues = await jira.getBacklog(+options.board, options.assignee);
  } else {
    issues = await jira.getIssuesInSprint(sprintOrBacklog, options.assignee);
  }

  if (issues.length === 0) {
    logger.log(`${chalk.green('No issues found')}.`);
    process.exit(0);
  }

  // TODO:
  // Show issue - allow to split it into tasks
  // Allow to set story points and assignee
  // add task into sprint

  for (const issue of issues) {
    logger.log(
      `\n${issueTypeSchema.parse(issue.fields?.issuetype.name)} ${issue.key} - ${chalk.bold(issueStatusSchema.parse(issue.fields?.status.name))} - ${chalk.italic(issue.fields?.assignee?.displayName ?? '')}`
    );
    logger.log(
      `${chalk.underline((issue.fields?.components ?? []).map(component => component.name).join(', ') || 'NO COMPONENT')} - ${chalk.italic(issue.fields?.summary ?? '')}`
    );
    logger.log(
      `See more: ${chalk.italic.underline(jira.getIssueURL(issue.key ?? ''))}\n`
    );

    const availableTasks = [
      { name: 'DEV Task', value: 39396, checked: true },
      { name: 'QE Task', value: 39400, checked: true },
      { name: 'Upstream', value: 39395 },
      { name: 'Root Cause Analysis Task', value: 40950 },
      { name: 'Preliminary Testing Task', value: 39398 },
      { name: 'Integration Testing', value: 48270 },
    ];

    const answer = await checkbox({
      message: `Split ${chalk.bold(issue.key)} into following tasks:\n`,
      choices: [
        ...availableTasks.map(task => ({
          name: colorTaskSchema(task.name),
          value: task.value,
          checked: task.checked ?? false,
        })),
        new Separator(),
        { name: 'SKIP', value: -1 },
        { name: 'EXIT', value: -2 },
      ],
      loop: false,
      pageSize: 10,
    });

    if (answer.includes(-1)) {
      continue;
    }

    if (answer.includes(-2)) {
      process.exit(0);
    }

    // Create tasks
    await jira.createTasks(issue.key!, answer);

    let tasks: Issue[] = [];
    // wait for tasks to be created
    for (let attempt = 1; attempt <= 10; attempt++) {
      tasks = await jira.getlinkedTasks(
        issue.key!,
        answer.map(
          task => availableTasks.find(t => t.value === task)?.name ?? ''
        )
      );

      if (Array.isArray(tasks) && tasks.length >= answer.length) break;
      if (attempt < 10) {
        logger.log(`Waiting for tasks to be created...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }

    // loop through tasks and and set sprint, assignee and story points
    for (const task of tasks) {
      // Skip QE Task
      if (task.fields.summary.includes('QE Task')) {
        continue;
      }

      logger.log(`${chalk.italic(task.fields.summary)}`);
      const storyPointsAnswer: Size = await select({
        message: 'Story Points',
        choices: [
          {
            name: colorSizeSchema.parse(0),
            value: 0,
          },
          {
            name: colorSizeSchema.parse(1),
            value: 1,
          },
          {
            name: colorSizeSchema.parse(2),
            value: 2,
          },
          {
            name: colorSizeSchema.parse(3),
            value: 3,
          },
          {
            name: colorSizeSchema.parse(5),
            value: 5,
          },
          {
            name: colorSizeSchema.parse(8),
            value: 8,
          },
          {
            name: colorSizeSchema.parse(13),
            value: 13,
          },
        ],
        default: issue.fields?.[jira.fields.storyPoints] ?? 3,
        pageSize: 6,
        loop: false,
      });

      const addToSprintAnswer = await select({
        message: 'Add to sprint',
        choices: [
          { name: `${chalk.green('Yes')}`, value: true },
          { name: `${chalk.red('No')}`, value: false },
        ],
        default: true,
        pageSize: 2,
        loop: false,
      });

      // update task
      await jira.setValues(task.key, {
        assignee: issue.fields?.assignee?.emailAddress,
        size: storyPointsAnswer,
        sprint:
          addToSprintAnswer && sprintOrBacklog != -1
            ? sprintOrBacklog
            : undefined,
      });
    }

    logger.log(
      `Dropping ${chalk.bold(issue.key)} from sprint and setting story points to ${chalk.bold(0)}...`
    );
    await jira.setValues(issue.key!, { size: 0, sprint: null });
  }
};

export default runProgram;
