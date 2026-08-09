import { AsyncLocalStorage } from 'node:async_hooks';

export type RequestAuditContext = {
  ipAddress?: string;
  userAgent?: string;
};

const requestAuditStorage = new AsyncLocalStorage<RequestAuditContext>();

export function runWithRequestAuditContext<T>(context: RequestAuditContext, next: () => T): T {
  return requestAuditStorage.run(context, next);
}

export function getRequestAuditContext(): RequestAuditContext {
  return requestAuditStorage.getStore() ?? {};
}
