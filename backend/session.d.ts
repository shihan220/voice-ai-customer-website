import 'express-session';

declare module 'express-session' {
  interface SessionData {
    adminUser?: {
      credentialFingerprint: string;
      email: string;
    };
    customerUser?: {
      authVersion: number;
      email: string;
      id: number;
    };
  }
}
