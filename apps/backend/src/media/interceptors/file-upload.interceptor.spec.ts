import { BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

/**
 * `FileUploadInterceptor` is produced by NestJS's `FileInterceptor(...)` factory
 * (a Multer-backed mixin class), not a hand-written class with its own
 * `intercept(context, next)` method. Exercising `intercept()` end-to-end would
 * require driving real multipart parsing through an Express req/res, which is
 * out of scope for a unit test and would not add meaningful coverage over the
 * options themselves.
 *
 * Instead, we mock `FileInterceptor` to capture the field name and Multer
 * options it was configured with, then invoke the captured `fileFilter` and
 * inspect `limits`/`storage` directly — this is the actual file-filtering and
 * size-limit logic this module owns.
 */
jest.mock('@nestjs/platform-express', () => ({
  FileInterceptor: jest.fn(() => class MockFileInterceptor {}),
}));

// Side-effect import: triggers the module-level `FileInterceptor('file', {...})`
// call (captured by the mock above) exactly once when this spec file loads.
import './file-upload.interceptor';

type FileFilterCallback = (error: Error | null, acceptFile: boolean) => void;
type FileFilter = (req: unknown, file: Express.Multer.File, callback: FileFilterCallback) => void;
interface CapturedOptions {
  storage: unknown;
  limits: { fileSize: number };
  fileFilter: FileFilter;
}

function buildFile(mimetype: string): Express.Multer.File {
  return {
    fieldname: 'file',
    originalname: 'upload.bin',
    encoding: '7bit',
    mimetype,
    size: 1024,
    buffer: Buffer.from('data'),
    destination: '',
    filename: '',
    path: '',
    stream: undefined as unknown as Express.Multer.File['stream'],
  };
}

describe('FileUploadInterceptor', () => {
  let fieldName: string;
  let options: CapturedOptions;

  beforeAll(() => {
    const mockCalls = (FileInterceptor as jest.Mock).mock.calls;
    const call = mockCalls[0] as [string, CapturedOptions];
    [fieldName, options] = call;
  });

  it('configures the field name and size limit', () => {
    expect(fieldName).toBe('file');
    expect(options.limits.fileSize).toBe(10 * 1024 * 1024);
  });

  it('uses in-memory (buffer-based) storage', () => {
    expect(options.storage).toBeDefined();
    expect(typeof (options.storage as { _handleFile?: unknown })._handleFile).toBe('function');
    expect(typeof (options.storage as { _removeFile?: unknown })._removeFile).toBe('function');
  });

  describe('fileFilter', () => {
    it.each(['image/png', 'image/jpeg', 'video/mp4', 'application/pdf', 'application/zip'])(
      'accepts allowed mime type %s',
      mimetype => {
        const callback = jest.fn();

        options.fileFilter({}, buildFile(mimetype), callback);

        expect(callback).toHaveBeenCalledWith(null, true);
      }
    );

    it.each(['text/plain', 'application/json', 'application/x-msdownload'])(
      'rejects disallowed mime type %s with a BadRequestException',
      mimetype => {
        const callback = jest.fn();

        options.fileFilter({}, buildFile(mimetype), callback);

        expect(callback).toHaveBeenCalledWith(expect.any(BadRequestException), false);
        const [error] = callback.mock.calls[0] as [BadRequestException, boolean];
        expect(error.message).toContain(mimetype);
      }
    );
  });
});
