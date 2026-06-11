import 'express-session';

declare module 'express-session' {
  interface SessionData {
    adminUser?: {
      email: string;
    };
    customerUser?: {
      email: string;
      id: number;
    };
  }
}
