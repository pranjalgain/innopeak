import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { of } from 'rxjs';

import type { AuditLogDecoratorOptions } from './audit.decorator';
import { AUDIT_LOG_KEY } from './audit.decorator';
import { AuditInterceptor } from './audit.interceptor';
import { AuditService } from './audit.service';

describe('AuditInterceptor', () => {
  let target: AuditInterceptor;
  let reflector: { get: jest.Mock };
  let auditService: { log: jest.Mock };

  const auditOptions: AuditLogDecoratorOptions = {
    operationType: 'INSERT',
    severity: 'MEDIUM',
    description: 'Created a new user',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditInterceptor,
        { provide: Reflector, useValue: { get: jest.fn() } },
        { provide: AuditService, useValue: { log: jest.fn() } },
      ],
    }).compile();

    target = module.get(AuditInterceptor);
    reflector = module.get(Reflector);
    auditService = module.get(AuditService);
  });

  afterEach(() => jest.clearAllMocks());

  function fakeHandler(): void {
    /* stand-in route handler reference */
  }

  function makeContext(request: Record<string, unknown>): ExecutionContext {
    return {
      getHandler: () => fakeHandler,
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;
  }

  function makeCallHandler(returnValue: unknown = { ok: true }): CallHandler {
    return { handle: () => of(returnValue) };
  }

  it('passes through without calling AuditService when no @AuditLog metadata is present', done => {
    reflector.get.mockReturnValue(undefined);
    const context = makeContext({ url: '/v1/users', headers: {}, socket: {} });
    const next = makeCallHandler({ ok: true });

    target.intercept(context, next).subscribe(result => {
      expect(result).toEqual({ ok: true });
      expect(auditService.log).not.toHaveBeenCalled();
      expect(reflector.get).toHaveBeenCalledWith(AUDIT_LOG_KEY, fakeHandler);
      done();
    });
  });

  it('writes an audit log entry with request metadata when @AuditLog is present', done => {
    reflector.get.mockReturnValue(auditOptions);
    const request = {
      url: '/v1/users/1',
      ip: '127.0.0.1',
      headers: { 'user-agent': 'jest-test-agent' },
      socket: { remoteAddress: '10.0.0.1' },
      user: { id: 'user-123' },
    };
    const context = makeContext(request);
    const next = makeCallHandler({ ok: true });

    target.intercept(context, next).subscribe(() => {
      expect(auditService.log).toHaveBeenCalledWith({
        requestedApi: '/v1/users/1',
        operationType: 'INSERT',
        severity: 'MEDIUM',
        description: '[userId=user-123] Created a new user',
        ipAddress: '127.0.0.1',
        userAgent: 'jest-test-agent',
      });
      done();
    });
  });

  it('falls back to the socket remoteAddress when request.ip is absent', done => {
    reflector.get.mockReturnValue(auditOptions);
    const request = {
      url: '/v1/users/1',
      ip: undefined,
      headers: {},
      socket: { remoteAddress: '10.0.0.9' },
      user: undefined,
    };
    const context = makeContext(request);
    const next = makeCallHandler({ ok: true });

    target.intercept(context, next).subscribe(() => {
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ ipAddress: '10.0.0.9', description: 'Created a new user' })
      );
      done();
    });
  });

  it('does not block the response on the audit write (fire-and-forget, not awaited)', () => {
    reflector.get.mockReturnValue(auditOptions);
    // A promise that never settles: if the interceptor awaited it, the response
    // emission below would never happen synchronously.
    auditService.log.mockReturnValue(new Promise(() => undefined));

    const request = {
      url: '/v1/users/1',
      ip: '127.0.0.1',
      headers: {},
      socket: {},
      user: undefined,
    };
    const context = makeContext(request);
    const next = makeCallHandler({ ok: true });

    let received: unknown;
    target.intercept(context, next).subscribe(result => {
      received = result;
    });

    expect(received).toEqual({ ok: true });
    expect(auditService.log).toHaveBeenCalled();
  });

  it('does not throw synchronously when the audit write rejects', () => {
    reflector.get.mockReturnValue(auditOptions);
    auditService.log.mockImplementation(() =>
      Promise.reject(new Error('db down')).catch(() => undefined)
    );

    const request = {
      url: '/v1/users/1',
      ip: '127.0.0.1',
      headers: {},
      socket: {},
      user: undefined,
    };
    const context = makeContext(request);
    const next = makeCallHandler({ ok: true });

    let received: unknown;
    expect(() => {
      target.intercept(context, next).subscribe(result => {
        received = result;
      });
    }).not.toThrow();

    expect(received).toEqual({ ok: true });
  });
});
