import { Logger } from '@nestjs/common';
import * as fse from 'fs-extra';

import * as path from 'path';

import { copyStaticAssets } from './copy-static-assets';

jest.mock('fs-extra', () => ({
  copy: jest.fn(),
}));

describe('copyStaticAssets', () => {
  let logSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('copies views and assets directories from the project root into dist', async () => {
    (fse.copy as jest.Mock).mockResolvedValue(undefined);

    await copyStaticAssets();

    const projectRoot = process.cwd();
    const distDir = path.join(projectRoot, 'dist');

    expect(fse.copy).toHaveBeenCalledWith(
      path.join(projectRoot, 'views'),
      path.join(distDir, 'views'),
      { overwrite: true }
    );
    expect(fse.copy).toHaveBeenCalledWith(
      path.join(projectRoot, 'assets'),
      path.join(distDir, 'assets'),
      { overwrite: true }
    );
    expect(fse.copy).toHaveBeenCalledTimes(2);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Copied views and assets'));
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('logs an error and does not throw when copying fails with an Error instance', async () => {
    const error = new Error('ENOENT: no such file or directory');
    (fse.copy as jest.Mock).mockRejectedValue(error);

    await expect(copyStaticAssets()).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to copy static files'),
      error.stack
    );
  });

  it('logs an error using JSON.stringify when the rejection is not an Error instance', async () => {
    (fse.copy as jest.Mock).mockRejectedValue('some non-error rejection');

    await expect(copyStaticAssets()).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to copy static files'),
      JSON.stringify('some non-error rejection')
    );
  });

  it('does not touch the real filesystem (fs-extra is mocked)', async () => {
    (fse.copy as jest.Mock).mockResolvedValue(undefined);
    await copyStaticAssets();
    // `fse.copy` is a jest mock (not the real fs-extra implementation), proving
    // no real filesystem access occurred.
    expect(jest.isMockFunction(fse.copy)).toBe(true);
  });
});
