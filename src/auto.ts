import chalk from 'chalk';
import { OptionValues } from 'commander';

import { Logger } from './logger';
import { Jira } from './jira';

export async function runAuto(options: OptionValues): Promise<void> {
  const logger = new Logger(!!options.nocolor);

  const jira = await Jira.getInstance(options.dry, logger, options.assignee);

  const boardIssues = await jira.getBoardIssues(
    options.board,
    `project = RHEL and issuetype in (Bug, Story, Vulnerability) and statusCategory != Done`
  );

  const preliminaryTestingRequested = boardIssues.filter(
    issue =>
      issue.fields?.[jira.fields.preliminaryTesting]?.value === 'Requested' &&
      !issue.fields?.issuelinks?.some(
        l =>
          l.type?.outward === 'split to' &&
          l.outwardIssue?.fields?.summary.startsWith(
            jira.preliminaryTestingTask.summary
          ) &&
          l.outwardIssue?.fields?.status.name !== 'Closed'
      )
  );
  logger.log(
    `${chalk.green('Preliminary Testing Requested')} - ${preliminaryTestingRequested.length}`
  );

  const preliminaryTestingFailed = boardIssues.filter(
    issue =>
      issue.fields?.[jira.fields.preliminaryTesting]?.value === 'Fail' &&
      issue.fields?.issuelinks?.some(
        l =>
          l.type?.outward === 'split to' &&
          l.outwardIssue?.fields?.summary.startsWith(
            jira.preliminaryTestingTask.summary
          ) &&
          l.outwardIssue?.fields?.status.name !== 'Closed'
      )
  );
  logger.log(
    `${chalk.red('Preliminary Testing Failed')} - ${preliminaryTestingFailed.length}`
  );

  if (preliminaryTestingRequested.length > 0) {
    logger.log(
      `${chalk.cyan('Creating split tasks for Preliminary Testing Requested...')}`
    );
  }

  for (const issue of preliminaryTestingRequested) {
    if (!issue.key) {
      continue;
    }

    await jira.createTasks(issue.key, [jira.preliminaryTestingTask.value]);
  }

  if (preliminaryTestingFailed.length > 0) {
    logger.log(
      `${chalk.red('Closing Preliminary Testing Task - Testing Failed...')}`
    );
  }

  for (const issue of preliminaryTestingFailed) {
    if (!issue.key) {
      continue;
    }

    const preliminaryTestingTask = issue.fields?.issuelinks?.find(
      l =>
        l.type?.outward === 'split to' &&
        l.outwardIssue?.fields?.summary.startsWith(
          jira.preliminaryTestingTask.summary
        ) &&
        l.outwardIssue?.fields?.status.name !== 'Closed'
    );

    if (!preliminaryTestingTask || !preliminaryTestingTask.outwardIssue?.key) {
      logger.log(
        `${chalk.red('Preliminary Testing Task not found')} - ${issue.key}`
      );
      continue;
    }

    await jira.closeTask(preliminaryTestingTask.outwardIssue?.key);
  }

  process.exit(0);
}
