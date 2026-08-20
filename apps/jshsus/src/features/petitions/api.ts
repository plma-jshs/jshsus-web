import type { PetitionDetail, PetitionSummary, RichTextDocument } from '@jshsus/types';
import { request } from '../../shared/api/http';

export function getPetitions() {
  return request<PetitionSummary[]>('/api/petitions');
}

export function getPetition(id: number) {
  return request<PetitionDetail>(`/api/petitions/${id}`);
}

export function createPetition(input: {
  title: string;
  content?: string;
  contentDoc?: RichTextDocument;
  endsAt: string;
}) {
  return request<{ ok: true; petition: { id: number; status: 'open' } }>('/api/petitions', {
    method: 'POST',
    body: input,
  });
}

export function updatePetition(
  id: number,
  input: {
    title?: string;
    content?: string;
    contentDoc?: RichTextDocument;
  },
) {
  return request<{ ok: true; id: number }>(`/api/petitions/${id}`, {
    method: 'PUT',
    body: input,
  });
}

export function deletePetition(id: number) {
  return request<{ ok: true; id: number }>(`/api/petitions/${id}`, {
    method: 'DELETE',
  });
}

export function participatePetition(id: number) {
  return request<{ ok: true; id: number; participated: boolean; participantCount?: number }>(
    `/api/petitions/${id}/participate`,
    { method: 'POST' },
  );
}
