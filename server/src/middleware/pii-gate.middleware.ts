import { Request, Response, NextFunction } from 'express';
import { verifyJWT } from '../auth.js';
import { maskPiiFields } from '../utils/pii-mask.js';

/**
 * Express middleware that intercepts res.json() calls and masks PII
 * when the authenticated user does not have full PII access.
 *
 * Parses the JWT from the Authorization header itself so it works
 * regardless of whether authMiddleware runs before or after this
 * middleware in the chain.
 */
export function piiGateMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const originalJson = res.json.bind(res);
  res.json = function (body: unknown) {
    // Try req.user first (set by authMiddleware), then parse JWT directly
    let user = req.user as
      | { id: number; role: string; piiAccessLevel?: string }
      | undefined;

    if (!user) {
      const authHeader = req.headers.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        const payload = verifyJWT(authHeader.slice(7));
        if (payload) {
          user = payload;
        }
      }
    }

    // Coaches always get full PII access (they need player/guardian data).
    // Admins must have a strong password (piiAccessLevel === 'full').
    const hasFullAccess =
      user?.role === 'coach' ||
      (user?.role === 'admin' && user?.piiAccessLevel === 'full');

    if (hasFullAccess) {
      return originalJson(body);
    }

    const masked = maskPiiFields(body);
    return originalJson(masked);
  };

  next();
}
