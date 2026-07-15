import chalk from 'chalk';
import { OptionValues } from 'commander';

import { Logger } from './logger';
import { Jira } from './jira';

export async function runAuto(options: OptionValues): Promise<void> {
  const logger = new Logger(!!options.nocolor);

  const jira = await Jira.getInstance(options.dry, logger, options.assignee);

  logger.log(
    `${chalk.cyan(`Verifying issues in board ${options.board} - team: ${options.team}`)}`
  );

  const boardIssues = await jira.getBoardIssues(
    options.board,
    `project = RHEL and issuetype in (Bug, Story, Vulnerability) and status != Closed`
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

  const issuesInIntegration = boardIssues.filter(
    issue =>
      issue.fields?.status.name === 'Integration' &&
      !issue.fields?.issuelinks?.some(
        l =>
          l.type?.outward === 'split to' &&
          l.outwardIssue?.fields?.summary.startsWith(jira.qeTask.summary) &&
          l.outwardIssue?.fields?.status.name !== 'Closed'
      )
  );

  const issuesInReleasePending = boardIssues.filter(
    issue =>
      issue.fields?.status.name === 'Release Pending' &&
      issue.fields?.issuelinks?.some(
        l =>
          l.type?.outward === 'split to' &&
          l.outwardIssue?.fields?.summary.startsWith(jira.qeTask.summary) &&
          l.outwardIssue?.fields?.status.name !== 'Closed'
      )
  );

  const summary = [
    {
      label: 'Preliminary Testing Requested',
      count: preliminaryTestingRequested.length,
    },
    {
      label: 'Preliminary Testing Failed',
      count: preliminaryTestingFailed.length,
    },
    { label: 'Integration w/o QE Task', count: issuesInIntegration.length },
    {
      label: 'Release Pending w/ QE Task',
      count: issuesInReleasePending.length,
    },
  ].filter(entry => entry.count > 0);

  for (const { label, count } of summary) {
    logger.log(`  ${chalk.cyan(label)}: ${chalk.bold(count)}`);
  }

  if (summary.length === 0) {
    logger.log(`  ${chalk.green('Nothing to do')}`);
  }

  for (const issue of preliminaryTestingRequested) {
    if (!issue.key) {
      continue;
    }

    await jira.createTasks(issue.key, [jira.preliminaryTestingTask.value]);
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
        `  ${chalk.red('Preliminary Testing Task not found')} - ${issue.key}`
      );
      continue;
    }

    await jira.closeTask(preliminaryTestingTask.outwardIssue?.key);
  }

  for (const issue of issuesInIntegration) {
    if (!issue.key) {
      continue;
    }

    await jira.createTasks(issue.key, [jira.qeTask.value]);
  }

  for (const issue of issuesInReleasePending) {
    if (!issue.key) {
      continue;
    }

    const qeTask = issue.fields?.issuelinks?.find(
      l =>
        l.type?.outward === 'split to' &&
        l.outwardIssue?.fields?.summary.startsWith(jira.qeTask.summary) &&
        l.outwardIssue?.fields?.status.name !== 'Closed'
    );

    if (!qeTask || !qeTask.outwardIssue?.key) {
      logger.log(`  ${chalk.red('QE Task not found')} - ${issue.key}`);
      continue;
    }

    await jira.closeTask(qeTask.outwardIssue?.key);
  }

  process.exit(0);
}
