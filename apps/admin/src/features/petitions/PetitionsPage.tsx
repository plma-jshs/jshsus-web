import type { FormEvent } from 'react';
import { useState } from 'react';
import type { PetitionSummary } from '@jshsus/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '../../components/DataTable';
import { api } from '../../shared/api/adminApi';

const statusLabels: Record<PetitionSummary['status'], string> = {
  open: '진행 중',
  awaiting_answer: '답변 대기',
  answered: '답변 완료',
  expired: '만료',
  hidden: '숨김',
};

export function PetitionsPage() {
  const queryClient = useQueryClient();
  const petitionsQuery = useQuery({ queryKey: ['admin-petitions'], queryFn: api.petitions });
  const petitions = petitionsQuery.data ?? [];
  const [answerForm, setAnswerForm] = useState({ id: 0, title: '', content: '' });
  const answerMutation = useMutation({
    mutationFn: ({ id, content }: { id: number; content: string }) =>
      api.answerPetition(id, content),
    onSuccess: async () => {
      setAnswerForm({ id: 0, title: '', content: '' });
      await queryClient.invalidateQueries({ queryKey: ['admin-petitions'] });
    },
  });

  const columns: ColumnDef<PetitionSummary>[] = [
    { accessorKey: 'title', header: '제목' },
    {
      id: 'participants',
      header: '참여',
      cell: ({ row }) => `${row.original.participantCount}/${row.original.threshold}`,
    },
    {
      accessorKey: 'endsAt',
      header: '마감',
      cell: ({ getValue }) => new Date(getValue<string>()).toLocaleDateString('ko-KR'),
    },
    {
      accessorKey: 'status',
      header: '상태',
      cell: ({ getValue }) => statusLabels[getValue<PetitionSummary['status']>()],
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <div className="table-action-row">
          <button
            className="table-action"
            type="button"
            onClick={() =>
              setAnswerForm({
                id: row.original.id,
                title: row.original.title,
                content: row.original.answer?.content ?? '',
              })
            }
            disabled={row.original.status === 'hidden'}
          >
            답변
          </button>
        </div>
      ),
    },
  ];

  const handleAnswer = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    answerMutation.mutate({ id: answerForm.id, content: answerForm.content });
  };

  return (
    <div className="admin-stack">
      <section className="admin-panel">
        <div className="panel-title">
          <h2>청원 답변</h2>
        </div>
        <DataTable columns={columns} data={petitions} />
      </section>

      {answerForm.id > 0 ? (
        <section className="admin-panel">
          <div className="panel-title">
            <h2>{answerForm.title}</h2>
          </div>
          <form className="answer-form" onSubmit={handleAnswer}>
            <label>
              <span>답변 내용</span>
              <textarea
                value={answerForm.content}
                onChange={(event) =>
                  setAnswerForm((form) => ({ ...form, content: event.target.value }))
                }
                rows={7}
                required
              />
            </label>
            <div className="button-row">
              <button className="primary-button" type="submit" disabled={answerMutation.isPending}>
                답변 저장
              </button>
              <button
                className="quiet-button"
                type="button"
                onClick={() => setAnswerForm({ id: 0, title: '', content: '' })}
                disabled={answerMutation.isPending}
              >
                취소
              </button>
            </div>
          </form>
          {answerMutation.isError ? <p className="form-error">답변 저장에 실패했습니다.</p> : null}
        </section>
      ) : null}
    </div>
  );
}
