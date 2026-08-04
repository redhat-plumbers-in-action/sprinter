import ProductPagesAPI, {
  isError,
  type ReleasesScheduleTasksResponse,
  type WhoamiResponse,
  type ScheduleTasksQueryOptions,
} from 'product-pages';

import chalk from 'chalk';

import { Logger } from './logger';

const PP_INSTANCE = 'https://pp.engineering.redhat.com/api/v7';

export class ProductPages {
  readonly api: ProductPagesAPI;

  constructor(
    readonly dry: boolean,
    readonly logger: Logger,
    instance: string = PP_INSTANCE
  ) {
    this.api = new ProductPagesAPI(instance, { type: 'kerberos' });
  }

  async whoami(): Promise<WhoamiResponse> {
    if (this.dry) {
      this.logger.log(chalk.dim('Fetching whoami (dry-run)'));
      return { username: 'dry-run@redhat.com' };
    }

    const response = await this.api.whoami();

    if (isError(response)) {
      throw new Error(
        `Product Pages whoami failed: ${(response as any).message}`
      );
    }

    return response;
  }

  async getScheduleTasks(
    release: string,
    options: ScheduleTasksQueryOptions
  ): Promise<ReleasesScheduleTasksResponse> {
    if (this.dry) {
      this.logger.log(
        chalk.dim(`Fetching schedule tasks for ${release} (dry-run)`)
      );
      // Return example tasks that match the REL_PREP and ITM 26 patterns so
      // the dry-run accurately simulates the due-date logic.
      const soon = new Date();
      soon.setDate(soon.getDate() + 10);
      const soonStr = `${soon.getFullYear()}-${String(soon.getMonth() + 1).padStart(2, '0')}-${String(soon.getDate()).padStart(2, '0')}`;
      return [
        {
          id: 1,
          name: 'Package Advisory REL_PREP Deadline (dry-run)',
          path: ['REL_PREP'],
          date_start: soonStr,
          date_finish: soonStr,
          release_shortname: release,
        },
        {
          id: 2,
          name: 'ITM 26 DevTestDoc (dry-run)',
          path: ['ITM 26'],
          date_start: soonStr,
          date_finish: soonStr,
          release_shortname: release,
        },
      ];
    }

    const response = await this.api.releasesScheduleTasks(release, options);

    if (isError(response)) {
      throw new Error(
        `Product Pages schedule tasks failed: ${(response as any).message}`
      );
    }

    return response;
  }

  static getInstance(dry: boolean, logger: Logger): ProductPages {
    return new ProductPages(dry, logger);
  }
}
