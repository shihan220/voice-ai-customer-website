import type { NextFunction, Request, Response } from 'express';
import { customerSessionCookieName } from '../core.ts';
import { getUserById } from '../services/customers.ts';

function rejectCustomerSession(
  req: Request,
  res: Response,
  status: 401 | 403,
  error: string,
) {
  req.session.customerUser = undefined;
  res.clearCookie(customerSessionCookieName);
  res.status(status).json({ error });
}

export async function requireCustomer(req: Request, res: Response, next: NextFunction) {
  const sessionUser = req.session.customerUser;

  if (!sessionUser) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }

  const user = await getUserById(sessionUser.id);

  if (!user) {
    rejectCustomerSession(req, res, 401, 'Authentication required.');
    return;
  }

  if (Number(sessionUser.authVersion) !== Number(user.auth_version)) {
    rejectCustomerSession(req, res, 401, 'Your session has expired. Log in again.');
    return;
  }

  if (user.account_status !== 'active') {
    rejectCustomerSession(req, res, 403, 'This account is disabled.');
    return;
  }

  req.session.customerUser = {
    authVersion: Number(user.auth_version),
    email: user.email,
    id: Number(user.id),
  };

  next();
}
