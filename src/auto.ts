import chalk from 'chalk';
import { OptionValues } from 'commander';

import { Logger } from './logger';
import { Jira } from './jira';

export async function runAuto(options: OptionValues): Promise<void> {
  const logger = new Logger(!!options.nocolor);

  const jira = await Jira.getInstance(options.dry, logger, options.assignee);

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
  if (preliminaryTestingRequested.length > 0) {
    logger.log(
      `${chalk.green('Preliminary Testing Requested')} - ${preliminaryTestingRequested.length}`
    );
  }

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
  if (preliminaryTestingFailed.length > 0) {
    logger.log(
      `${chalk.red('Preliminary Testing Failed')} - ${preliminaryTestingFailed.length}`
    );
  }

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
  if (issuesInIntegration.length > 0) {
    logger.log(
      `${chalk.yellow('Issues in Integration w/o QE Task')} - ${issuesInIntegration.length}`
    );
  }

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
  if (issuesInReleasePending.length > 0) {
    logger.log(
      `${chalk.yellow('Issues in Release Pending with QE Task')} - ${issuesInReleasePending.length}`
    );
  }

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

  if (issuesInIntegration.length > 0) {
    logger.log(
      `${chalk.cyan('Creating split tasks for Issues in Integration w/o QE Task...')}`
    );
  }

  for (const issue of issuesInIntegration) {
    if (!issue.key) {
      continue;
    }

    await jira.createTasks(issue.key, [jira.qeTask.value]);
  }

  if (issuesInReleasePending.length > 0) {
    logger.log(
      `${chalk.cyan('Closing QE tasks - parent issue in Release Pending...')}`
    );
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
      logger.log(`${chalk.red('QE Task not found')} - ${issue.key}`);
      continue;
    }

    await jira.closeTask(qeTask.outwardIssue?.key);
  }

  process.exit(0);
}
