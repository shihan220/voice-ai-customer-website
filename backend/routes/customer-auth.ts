import type { NextFunction, Request, Response } from 'express';

export function requireCustomer(req: Request, res: Response, next: NextFunction) {
  if (!req.session.customerUser) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }

  next();
}
