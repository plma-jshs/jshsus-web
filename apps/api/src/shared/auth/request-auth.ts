import type { Request } from 'express';
import type { AuthSession } from '../../modules/auth/auth.service';

export type AuthenticatedRequest = Request & {
  authSession?: AuthSession;
  authToken?: string;
};
