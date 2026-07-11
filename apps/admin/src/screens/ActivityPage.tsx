import type { FormEvent } from 'react';
import { useState } from 'react';
import type { ActivityRequestSummary } from '@jshsus/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '../components/DataTable';
import { api } from '../lib/api';

const statusLabels: Record<ActivityRequestSummary['status'], string> = {
  draft: '임시저장',
  submitted: '승인 대기',
  approved: '승인',
  rejected: '반려',
  canceled: '취소',
  completed: '완료',
};

export function ActivityPage() {
  const queryClient = useQueryClient();
  const [rejectForm, setRejectForm] = useState({ id: 0, reason: '' });
  const [selectedPrintId, setSelectedPrintId] = useState<number | null>(null);
  const requestsQuery = useQuery({
    queryKey: ['activity-requests'],
    queryFn: api.activityRequests,
  });
  const requests = requestsQuery.data ?? [];
  const selectedPrintRequest = requests.find((request) => request.id === selectedPrintId);

  const refreshActivityRequests = async () => {
    await queryClient.invalidateQueries({ queryKey: ['activity-requests'] });
  };

  const approveMutation = useMutation({
    mutationFn: api.approveActivityRequest,
    onSuccess: async (result) => {
      setSelectedPrintId(result.id);
      await refreshActivityRequests();
    },
  });
  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      api.rejectActivityRequest(id, reason),
    onSuccess: async () => {
      setRejectForm({ id: 0, reason: '' });
      await refreshActivityRequests();
    },
  });
  const printMutation = useMutation({
    mutationFn: api.markActivityRequestPrinted,
    onSuccess: () => {
      window.print();
    },
  });

  const columns: ColumnDef<ActivityRequestSummary>[] = [
    { accessorKey: 'studentNo', header: '학번' },
    { accessorKey: 'studentName', header: '학생' },
    { accessorKey: 'teacherName', header: '승인 교사' },
    { accessorKey: 'location', header: '장소' },
    { accessorKey: 'purpose', header: '활동 내용' },
    {
      accessorKey: 'startsAt',
      header: '시작',
      cell: ({ getValue }) => new Date(getValue<string>()).toLocaleString('ko-KR'),
    },
    {
      accessorKey: 'endsAt',
      header: '종료',
      cell: ({ getValue }) => new Date(getValue<string>()).toLocaleString('ko-KR'),
    },
    {
      accessorKey: 'status',
      header: '상태',
      cell: ({ getValue }) => statusLabels[getValue<ActivityRequestSummary['status']>()],
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <div className="table-action-row">
          <button
            className="table-action"
            type="button"
            onClick={() => approveMutation.mutate(row.original.id)}
            disabled={approveMutation.isPending || row.original.status !== 'submitted'}
          >
            승인
          </button>
          <button
            className="table-action"
            type="button"
            onClick={() =>
              setRejectForm({ id: row.original.id, reason: row.original.rejectionReason ?? '' })
            }
            disabled={row.original.status !== 'submitted'}
          >
            반려
          </button>
          <button
            className="table-action"
            type="button"
            onClick={() => setSelectedPrintId(row.original.id)}
            disabled={row.original.status !== 'approved'}
          >
            출력
          </button>
        </div>
      ),
    },
  ];

  const handleReject = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    rejectMutation.mutate({ id: rejectForm.id, reason: rejectForm.reason });
  };

  return (
    <div className="admin-stack">
      <section className="admin-panel">
        <div className="panel-title">
          <h2>탐활서 승인</h2>
        </div>
        <DataTable columns={columns} data={requests} />
      </section>

      {rejectForm.id > 0 ? (
        <section className="admin-panel">
          <div className="panel-title">
            <h2>반려 사유</h2>
          </div>
          <form className="admin-form-grid compact-form" onSubmit={handleReject}>
            <label>
              <span>사유</span>
              <input
                value={rejectForm.reason}
                onChange={(event) =>
                  setRejectForm((form) => ({ ...form, reason: event.target.value }))
                }
                maxLength={500}
              />
            </label>
            <button className="primary-button" type="submit" disabled={rejectMutation.isPending}>
              반려 저장
            </button>
            <button
              className="quiet-button"
              type="button"
              onClick={() => setRejectForm({ id: 0, reason: '' })}
              disabled={rejectMutation.isPending}
            >
              취소
            </button>
          </form>
          {rejectMutation.isError ? <p className="form-error">반려 처리에 실패했습니다.</p> : null}
        </section>
      ) : null}

      <section className="admin-panel print-source">
        <div className="panel-title">
          <h2>출력용 탐구활동서</h2>
          <button
            className="primary-button"
            type="button"
            onClick={() => selectedPrintRequest && printMutation.mutate(selectedPrintRequest.id)}
            disabled={!selectedPrintRequest?.issuedNumber || printMutation.isPending}
          >
            출력
          </button>
        </div>
        {selectedPrintRequest ? (
          <article className="activity-permit">
            <div>
              <span>발급번호</span>
              <strong>{selectedPrintRequest.issuedNumber ?? '-'}</strong>
            </div>
            <h3>탐구활동서</h3>
            <dl>
              <div>
                <dt>학생</dt>
                <dd>
                  {selectedPrintRequest.studentNo} {selectedPrintRequest.studentName}
                </dd>
              </div>
              <div>
                <dt>장소</dt>
                <dd>{selectedPrintRequest.location}</dd>
              </div>
              <div>
                <dt>시간</dt>
                <dd>
                  {new Date(selectedPrintRequest.startsAt).toLocaleString('ko-KR')} -{' '}
                  {new Date(selectedPrintRequest.endsAt).toLocaleString('ko-KR')}
                </dd>
              </div>
              <div>
                <dt>목적</dt>
                <dd>{selectedPrintRequest.purpose}</dd>
              </div>
              <div>
                <dt>승인 교사</dt>
                <dd>{selectedPrintRequest.teacherName ?? '-'}</dd>
              </div>
            </dl>
          </article>
        ) : (
          <p className="empty-text">승인된 탐활서를 선택하면 출력 화면이 표시됩니다.</p>
        )}
      </section>
    </div>
  );
}
