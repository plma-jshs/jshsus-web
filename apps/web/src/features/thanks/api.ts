import type { ThanksChallengeCreateResult, ThanksChallengeData } from '@jshsus/types';
import { request } from '../../shared/api/http';

export function getThanksChallenge() {
  return request<ThanksChallengeData>('/api/thanks');
}

export function createThanksMessage(message: string) {
  return request<ThanksChallengeCreateResult>('/api/thanks', {
    method: 'POST',
    body: { message },
  });
}
