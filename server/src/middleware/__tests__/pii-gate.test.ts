import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../auth.js', () => ({
  verifyJWT: vi.fn(),
}));

import { piiGateMiddleware } from '../pii-gate.middleware.js';
import { verifyJWT } from '../../auth.js';

const mockVerifyJWT = vi.mocked(verifyJWT);

function createMockReq(
  user?: { id: number; role: string; piiAccessLevel?: string },
  authHeader?: string,
) {
  return {
    user,
    headers: { authorization: authHeader },
    method: 'GET',
    originalUrl: '/api/test',
  } as any;
}

function createMockRes() {
  const res: any = {};
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function createMockNext() {
  return vi.fn();
}

describe('piiGateMiddleware', () => {
  beforeEach(() => {
    mockVerifyJWT.mockReset();
  });

  it('passes response through unmodified for admin with full PII access (req.user)', () => {
    const req = createMockReq({ id: 1, role: 'admin', piiAccessLevel: 'full' });
    const res = createMockRes();
    const originalJsonFn = res.json;
    const next = createMockNext();

    piiGateMiddleware(req, res, next);

    expect(next).toHaveBeenCalledOnce();

    const payload = { name: 'Luca Müller', email: 'luca@example.com', phone: '+41 79 123 45 67' };
    res.json(payload);

    expect(originalJsonFn).toHaveBeenCalledOnce();
    expect(originalJsonFn).toHaveBeenCalledWith(payload);
  });

  it('parses JWT from Authorization header when req.user is absent', () => {
    mockVerifyJWT.mockReturnValue({ id: 1, role: 'admin', piiAccessLevel: 'full' });

    const req = createMockReq(undefined, 'Bearer fake-token');
    const res = createMockRes();
    const originalJsonFn = res.json;
    const next = createMockNext();

    piiGateMiddleware(req, res, next);

    const payload = { name: 'Luca Müller', email: 'luca@example.com', phone: '+41 79 123 45 67' };
    res.json(payload);

    expect(mockVerifyJWT).toHaveBeenCalledWith('fake-token');
    expect(originalJsonFn).toHaveBeenCalledOnce();
    expect(originalJsonFn).toHaveBeenCalledWith(payload);
  });

  it('masks PII fields for admin with restricted PII access', () => {
    const req = createMockReq({ id: 1, role: 'admin', piiAccessLevel: 'restricted' });
    const res = createMockRes();
    const originalJsonFn = res.json;
    const next = createMockNext();

    piiGateMiddleware(req, res, next);

    expect(next).toHaveBeenCalledOnce();

    const payload = { name: 'Luca Müller', email: 'luca@example.com', phone: '+41 79 123 45 67' };
    res.json(payload);

    expect(originalJsonFn).toHaveBeenCalledOnce();
    const maskedArg = originalJsonFn.mock.calls[0][0] as Record<string, unknown>;
    expect(maskedArg.name).toBe('L. M.');
    expect(maskedArg.email).toBe('l***@example.com');
    expect(maskedArg.phone).toContain('***');
    expect(maskedArg.phone).not.toBe('+41 79 123 45 67');
  });

  it('masks PII fields when no user is present (unauthenticated)', () => {
    const req = createMockReq(undefined);
    const res = createMockRes();
    const originalJsonFn = res.json;
    const next = createMockNext();

    piiGateMiddleware(req, res, next);

    expect(next).toHaveBeenCalledOnce();

    const payload = { name: 'Anna Schmidt', email: 'anna@club.ch' };
    res.json(payload);

    expect(originalJsonFn).toHaveBeenCalledOnce();
    const masked = originalJsonFn.mock.calls[0][0] as Record<string, unknown>;
    expect(masked.name).toBe('A. S.');
    expect(masked.email).toBe('a***@club.ch');
  });

  it('grants full access to coaches without password strength check', () => {
    const req = createMockReq({ id: 2, role: 'coach' });
    const res = createMockRes();
    const originalJsonFn = res.json;
    const next = createMockNext();

    piiGateMiddleware(req, res, next);

    const payload = { name: 'Luca Müller', email: 'luca@example.com', phone: '+41 79 123 45 67' };
    res.json(payload);

    expect(originalJsonFn).toHaveBeenCalledOnce();
    expect(originalJsonFn).toHaveBeenCalledWith(payload);
  });

  it('grants full access to coaches via JWT header fallback', () => {
    mockVerifyJWT.mockReturnValue({ id: 2, role: 'coach' });

    const req = createMockReq(undefined, 'Bearer coach-token');
    const res = createMockRes();
    const originalJsonFn = res.json;
    const next = createMockNext();

    piiGateMiddleware(req, res, next);

    const payload = { name: 'Luca Müller', phone: '+41 79 123 45 67' };
    res.json(payload);

    expect(originalJsonFn).toHaveBeenCalledOnce();
    expect(originalJsonFn).toHaveBeenCalledWith(payload);
  });

  it('masks PII for non-staff role even if piiAccessLevel is full', () => {
    const req = createMockReq({ id: 3, role: 'parent', piiAccessLevel: 'full' });
    const res = createMockRes();
    const originalJsonFn = res.json;
    const next = createMockNext();

    piiGateMiddleware(req, res, next);

    expect(next).toHaveBeenCalledOnce();

    const payload = { name: 'Marco Rossi', email: 'marco@team.com', phone: '+41791234567' };
    res.json(payload);

    expect(originalJsonFn).toHaveBeenCalledOnce();
    const masked = originalJsonFn.mock.calls[0][0] as Record<string, unknown>;
    expect(masked.name).toBe('M. R.');
    expect(masked.email).toBe('m***@team.com');
    expect(masked.phone).not.toBe('+41791234567');
  });

  it('grants full access when req.user is set after middleware but before res.json()', () => {
    const req = createMockReq(undefined);
    const res = createMockRes();
    const originalJsonFn = res.json;
    const next = createMockNext();

    piiGateMiddleware(req, res, next);

    // authMiddleware sets req.user after piiGate has already run
    (req as any).user = { id: 1, role: 'admin', piiAccessLevel: 'full' };

    const payload = { name: 'Luca Müller', email: 'luca@example.com', phone: '+41 79 123 45 67' };
    res.json(payload);

    expect(originalJsonFn).toHaveBeenCalledOnce();
    expect(originalJsonFn).toHaveBeenCalledWith(payload);
  });

  it('recursively masks PII in nested objects and arrays', () => {
    const req = createMockReq(undefined);
    const res = createMockRes();
    const originalJsonFn = res.json;
    const next = createMockNext();

    piiGateMiddleware(req, res, next);

    const payload = {
      event: 'Training',
      attendees: [
        { name: 'Luca Müller', email: 'luca@example.com' },
        { name: 'Anna Schmidt', phone: '+41 79 999 88 77' },
      ],
      organizer: {
        name: 'Coach Meier',
        contact: {
          email: 'meier@club.ch',
          phone: '+41761112233',
        },
      },
    };

    res.json(payload);

    expect(originalJsonFn).toHaveBeenCalledOnce();
    const masked = originalJsonFn.mock.calls[0][0] as any;

    expect(masked.event).toBe('Training');
    expect(masked.attendees[0].name).toBe('L. M.');
    expect(masked.attendees[0].email).toBe('l***@example.com');
    expect(masked.attendees[1].name).toBe('A. S.');
    expect(masked.attendees[1].phone).toContain('***');
    expect(masked.organizer.name).toBe('C. M.');
    expect(masked.organizer.contact.email).toBe('m***@club.ch');
    expect(masked.organizer.contact.phone).not.toBe('+41761112233');
  });
});
