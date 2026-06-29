import type { NextFunction, Request, Response } from 'express';
import { getUserById } from '../services/customers.ts';

export async function requireCustomer(req: Request, res: Response, next: NextFunction) {
  const sessionUser = req.session.customerUser;

  if (!sessionUser) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }

  const user = await getUserById(sessionUser.id);

  if (!user) {
    req.session.customerUser = undefined;
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }

  if (user.account_status !== 'active') {
    req.session.customerUser = undefined;
    res.status(403).json({ error: 'This account is disabled.' });
    return;
  }

  req.session.customerUser = {
    email: user.email,
    id: user.id,
  };

  next();
}
