import chalk from 'chalk';
import { OptionValues } from 'commander';

import { Logger } from './logger';
import { ProductPages } from './product-pages';
import {
  readDeadlines,
  writeDeadlines,
  DEFAULT_DEADLINES_PATH,
  classifyScheduleTasks,
  SCHEDULE_TASK_REGEX,
  type DeadlinesFile,
  ReleaseDeadlines,
} from './schema/deadlines';

export async function runPpSync(
  releases: string[],
  options: OptionValues
): Promise<void> {
  const logger = new Logger(!!options.nocolor);
  const pp = ProductPages.getInstance(!!options.dry, logger);
  const filePath: string = options.deadlinesFile ?? DEFAULT_DEADLINES_PATH;

  const whoami = await pp.whoami();
  logger.log(chalk.dim(`Authenticated as: ${whoami.username}`));

  const existing = readDeadlines(filePath);
  const mergedReleases: Record<string, ReleaseDeadlines> = {
    ...(existing?.releases ?? {}),
  };

  for (const release of releases) {
    logger.log(`\n${chalk.cyan('Syncing')} ${chalk.bold(release)}...`);

    try {
      const tasks = await pp.getScheduleTasks(release, {
        name__regex: SCHEDULE_TASK_REGEX,
      });

      const deadlines = classifyScheduleTasks(tasks);
      mergedReleases[release] = deadlines;

      if (deadlines.rel_prep.length > 0) {
        for (const entry of deadlines.rel_prep) {
          logger.log(
            `  ${chalk.cyan(entry.name)}: ${chalk.bold(entry.date_finish)}`
          );
        }
      } else {
        logger.log(`  REL_PREP: ${chalk.dim('not found')}`);
      }
      const itm26 = deadlines.itm_26
        ? chalk.bold(deadlines.itm_26)
        : chalk.dim('not found');
      logger.log(`  ITM 26:   ${itm26}`);
    } catch (error) {
      logger.log(chalk.yellow(`  Failed to sync ${release}: ${error}`));
    }
  }

  const data: DeadlinesFile = {
    updated_at: new Date().toISOString(),
    releases: mergedReleases,
  };

  if (options.dry) {
    logger.log(chalk.dim(`\nDry run — would write to ${filePath}`));
    logger.log(chalk.dim(JSON.stringify(data, null, 2)));
  } else {
    writeDeadlines(data, filePath);
    logger.log(`\n${chalk.green('Saved')} ${chalk.underline(filePath)}`);
  }
}
