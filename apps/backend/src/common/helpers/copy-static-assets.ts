import { Logger } from '@nestjs/common';
import * as fse from 'fs-extra';

import * as path from 'path';

const logger = new Logger('CopyStaticAssets');

export async function copyStaticAssets(): Promise<void> {
  const projectRoot = process.cwd();
  const distDir = path.join(projectRoot, 'dist');

  const viewsSrc = path.join(projectRoot, 'views');
  const assetsSrc = path.join(projectRoot, 'assets');

  const viewsDest = path.join(distDir, 'views');
  const assetsDest = path.join(distDir, 'assets');

  try {
    await fse.copy(viewsSrc, viewsDest, { overwrite: true });
    await fse.copy(assetsSrc, assetsDest, { overwrite: true });
    logger.log('[Static Copy] ✅ Copied views and assets after bootstrap');
  } catch (err) {
    logger.error(
      '[Static Copy] ❌ Failed to copy static files:',
      err instanceof Error ? err.stack : JSON.stringify(err)
    );
  }
}
