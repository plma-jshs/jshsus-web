import { Injectable } from '@nestjs/common';

type MetricsBucket = {
  requests: number;
  serverErrors: number;
};

const HOUR_MS = 60 * 60 * 1_000;
const WINDOW_HOURS = 24;

@Injectable()
export class OperationalMetricsService {
  private readonly startedAt = new Date();
  private readonly buckets = new Map<number, MetricsBucket>();

  record(statusCode: number) {
    const hour = Math.floor(Date.now() / HOUR_MS);
    const bucket = this.buckets.get(hour) ?? { requests: 0, serverErrors: 0 };
    bucket.requests += 1;
    if (statusCode >= 500) bucket.serverErrors += 1;
    this.buckets.set(hour, bucket);
    this.prune(hour);
  }

  snapshot() {
    const currentHour = Math.floor(Date.now() / HOUR_MS);
    this.prune(currentHour);
    let requests = 0;
    let serverErrors = 0;
    for (const [hour, bucket] of this.buckets) {
      if (hour <= currentHour && hour > currentHour - WINDOW_HOURS) {
        requests += bucket.requests;
        serverErrors += bucket.serverErrors;
      }
    }
    return {
      requests,
      serverErrors,
      startedAt: this.startedAt.toISOString(),
    };
  }

  private prune(currentHour: number) {
    for (const hour of this.buckets.keys()) {
      if (hour <= currentHour - WINDOW_HOURS) this.buckets.delete(hour);
    }
  }
}
