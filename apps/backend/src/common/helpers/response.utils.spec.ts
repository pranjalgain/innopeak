import { ResponseUtil } from './response.utils';

describe('ResponseUtil', () => {
  describe('success', () => {
    it('builds a success response with defaults', () => {
      const result = ResponseUtil.success({ id: 1 });
      expect(result).toEqual({
        status: 'Success',
        data: { id: 1 },
        message: 'Success',
        statusCode: 200,
      });
    });

    it('builds a success response with a custom message and status code', () => {
      const result = ResponseUtil.success('data', 'Created', 201);
      expect(result).toEqual({
        status: 'Success',
        data: 'data',
        message: 'Created',
        statusCode: 201,
      });
    });

    it('accepts null/undefined data', () => {
      const result = ResponseUtil.success(null);
      expect(result.data).toBeNull();
    });
  });

  describe('error', () => {
    it('builds an error response with defaults', () => {
      const result = ResponseUtil.error(undefined, undefined, null);
      expect(result).toEqual({
        status: 'Failure',
        data: null,
        message: 'Error',
        statusCode: 500,
      });
    });

    it('builds an error response with a custom message, status code, and data', () => {
      const result = ResponseUtil.error('Not Found', 404, { reason: 'missing' });
      expect(result).toEqual({
        status: 'Failure',
        data: { reason: 'missing' },
        message: 'Not Found',
        statusCode: 404,
      });
    });
  });
});
