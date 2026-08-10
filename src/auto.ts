import chalk from 'chalk';
import { OptionValues } from 'commander';

import { Logger } from './logger';
import { Jira } from './jira';
import { ProductPages } from './product-pages';
import {
  readDeadlines,
  DEFAULT_DEADLINES_PATH,
  computePreliminaryTestingDueDate,
  computeQeTaskDueDate,
  classifyScheduleTasks,
  SCHEDULE_TASK_REGEX,
  type ReleaseDeadlines,
} from './schema/deadlines';

export async function runAuto(options: OptionValues): Promise<void> {
  const logger = new Logger(!!options.nocolor);
  const deadlinesFile: string = options.deadlinesFile ?? DEFAULT_DEADLINES_PATH;

  const jira = await Jira.getInstance(options.dry, logger, options.assignee);

  logger.log(
    `${chalk.cyan(`Verifying issues in board ${options.board} - team: ${options.team}`)}`
  );

  const boardIssues = await jira.getBoardIssues(
    options.board,
    `project = RHEL and issuetype in (Bug, Story, Vulnerability) and status != Closed`
  );

  const uniqueReleases = extractUniqueReleases(boardIssues);
  const deadlinesDb = await loadDeadlines(
    uniqueReleases,
    deadlinesFile,
    !!options.dry,
    logger
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

  const activeSprint = await jira.getActiveSprint(+options.board);
  let tasksWithoutSprint: { key?: string; fields?: Record<string, any> }[] = [];

  if (!activeSprint) {
    logger.log(
      `  ${chalk.yellow('No active sprint found — skipping sprint assignment')}`
    );
  } else {
    const sprintAssignmentJQL = `project in (RHEL, "RHEL Miscellaneous") AND labels in (NEWA, dev_task, qe_task, upstream_task, root_cause_analysis_task, preliminary_testing_task, integration_testing_task) AND "Flagged[Checkboxes]" = EMPTY AND Sprint is EMPTY AND "AssignedTeam[Dropdown]" = "${options.team}" AND statusCategory = "In Progress" AND type = Task`;

    tasksWithoutSprint = await jira.getBoardIssues(
      +options.board,
      sprintAssignmentJQL
    );
  }

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
    { label: 'In Progress w/o Sprint', count: tasksWithoutSprint.length },
  ].filter(entry => entry.count > 0);

  for (const { label, count } of summary) {
    logger.log(`  ${chalk.cyan(label)}: ${chalk.bold(count)}`);
  }

  if (summary.length === 0) {
    logger.log(`  ${chalk.green('Nothing to do')}`);
  }

  type DueDateJob = {
    parentKey: string;
    taskName: string;
    summaryPrefix: string;
    dueDate: string;
  };
  const dueDateJobs: DueDateJob[] = [];

  for (const issue of preliminaryTestingRequested) {
    if (!issue.key) {
      continue;
    }

    await jira.createTasks(issue.key, [jira.preliminaryTestingTask.value]);

    const dueDate = resolveDueDate(issue, 'preliminary', deadlinesDb, logger);
    if (dueDate) {
      dueDateJobs.push({
        parentKey: issue.key,
        taskName: jira.preliminaryTestingTask.name,
        summaryPrefix: jira.preliminaryTestingTask.summary,
        dueDate,
      });
    }
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

    const dueDate = resolveDueDate(issue, 'qe', deadlinesDb, logger);
    if (dueDate) {
      dueDateJobs.push({
        parentKey: issue.key,
        taskName: jira.qeTask.name,
        summaryPrefix: jira.qeTask.summary,
        dueDate,
      });
    }
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

  if (activeSprint) {
    for (const task of tasksWithoutSprint) {
      if (!task.key) {
        continue;
      }

      await jira.addToSprint(task.key, activeSprint.id);
    }
  }

  const dueDateResults = await Promise.allSettled(
    dueDateJobs.map(job =>
      setDueDateOnSplitTask(
        jira,
        job.parentKey,
        job.taskName,
        job.summaryPrefix,
        job.dueDate,
        logger
      )
    )
  );
  for (const result of dueDateResults) {
    if (result.status === 'rejected') {
      logger.log(chalk.yellow(`  Due date operation failed: ${result.reason}`));
    }
  }

  process.exit(0);
}

function extractUniqueReleases(
  issues: { fields?: Record<string, any> }[]
): string[] {
  const releases = new Set<string>();
  for (const issue of issues) {
    const fixVersions = issue.fields?.fixVersions;
    if (Array.isArray(fixVersions)) {
      for (const v of fixVersions as { name?: string }[]) {
        if (v?.name) releases.add(v.name);
      }
    }
  }
  return [...releases];
}

async function loadDeadlines(
  releases: string[],
  deadlinesFile: string,
  dry: boolean,
  logger: Logger
): Promise<Record<string, ReleaseDeadlines>> {
  const pp = ProductPages.getInstance(dry, logger);

  // If authentication fails, fall back to the entire cached file.
  try {
    const whoami = await pp.whoami();
    logger.log(chalk.dim(`Authenticated as: ${whoami.username}`));
  } catch {
    logger.log(
      chalk.yellow('Product Pages unavailable, using cached deadlines')
    );
    const cached = readDeadlines(deadlinesFile);
    if (!cached) {
      logger.log(chalk.red(`No cached deadlines found at ${deadlinesFile}`));
      return {};
    }
    logger.log(chalk.dim(`Using cached data from ${cached.updated_at}`));
    return cached.releases;
  }

  // Fetch per-release — skip individual failures so a single bad release
  // does not discard fresh data already retrieved for other releases.
  const result: Record<string, ReleaseDeadlines> = {};
  for (const release of releases) {
    try {
      const tasks = await pp.getScheduleTasks(release, {
        name__regex: SCHEDULE_TASK_REGEX,
      });
      result[release] = classifyScheduleTasks(tasks);
    } catch {
      logger.log(
        chalk.yellow(`  Could not fetch deadlines for ${release}, skipping`)
      );
    }
  }
  return result;
}

async function setDueDateOnSplitTask(
  jira: Jira,
  parentKey: string,
  taskName: string,
  summaryPrefix: string,
  dueDate: string,
  logger: Logger
): Promise<void> {
  for (let attempt = 1; attempt <= 10; attempt++) {
    const tasks = await jira.getlinkedTasks(parentKey, [taskName]);
    const splitTask = tasks.find(t =>
      t.fields?.summary?.startsWith(summaryPrefix)
    );

    if (splitTask?.key) {
      await jira.setDueDate(splitTask.key, dueDate);
      return;
    }

    if (attempt < 15) {
      logger.log(chalk.dim(`  Waiting for ${taskName} on ${parentKey}...`));
      await new Promise(resolve => setTimeout(resolve, 10000));
    }
  }

  logger.log(
    chalk.yellow(
      `  ${taskName} not found for ${parentKey} — could not set due date`
    )
  );
}

function resolveDueDate(
  issue: { key?: string; fields?: Record<string, any> },
  taskType: 'preliminary' | 'qe',
  deadlinesDb: Record<string, ReleaseDeadlines>,
  logger: Logger
): string | null {
  const fixVersion = issue.fields?.fixVersions?.[0]?.name;
  if (!fixVersion) {
    logger.log(
      chalk.dim(`  No fixVersion on ${issue.key} — skipping due date`)
    );
    return null;
  }

  const deadlines = deadlinesDb[fixVersion];
  if (!deadlines) {
    logger.log(
      chalk.dim(
        `  No deadlines for ${fixVersion} — skipping due date on ${issue.key}`
      )
    );
    return null;
  }

  const isZStream = fixVersion.endsWith('.z');

  if (taskType === 'preliminary') {
    return computePreliminaryTestingDueDate(deadlines, isZStream);
  }

  return computeQeTaskDueDate(deadlines, isZStream);
}
