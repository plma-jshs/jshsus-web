import type { FormEvent } from 'react';
import { useState } from 'react';
import type { PointReason, PointRecord, StudentOption } from '@jshsus/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { api } from '../../shared/api/adminApi';
import { DataTable } from '../../components/DataTable';

const today = new Date().toISOString().slice(0, 10);

export function PointsPage() {
  const queryClient = useQueryClient();
  const summaryQuery = useQuery({ queryKey: ['points-summary'], queryFn: api.pointSummary });
  const reasonsQuery = useQuery({ queryKey: ['point-reasons'], queryFn: api.pointReasons });
  const studentsQuery = useQuery({ queryKey: ['point-students'], queryFn: api.pointStudents });
  const [recordForm, setRecordForm] = useState({
    studentId: '',
    reasonId: '',
    comment: '',
    baseDate: today,
  });
  const [reasonForm, setReasonForm] = useState<{
    type: PointReason['type'];
    point: string;
    comment: string;
  }>({
    type: 'PLUS',
    point: '1',
    comment: '',
  });

  const refreshPoints = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['points-summary'] }),
      queryClient.invalidateQueries({ queryKey: ['point-reasons'] }),
      queryClient.invalidateQueries({ queryKey: ['point-students'] }),
    ]);
  };

  const createRecordMutation = useMutation({
    mutationFn: api.createPointRecord,
    onSuccess: async () => {
      setRecordForm((form) => ({ ...form, comment: '' }));
      await refreshPoints();
    },
  });
  const cancelRecordMutation = useMutation({
    mutationFn: (id: number) => api.cancelPointRecord(id, '관리자 화면에서 취소'),
    onSuccess: refreshPoints,
  });
  const createReasonMutation = useMutation({
    mutationFn: api.createPointReason,
    onSuccess: async () => {
      setReasonForm({ type: 'PLUS', point: '1', comment: '' });
      await refreshPoints();
    },
  });

  const columns: ColumnDef<PointRecord>[] = [
    { accessorKey: 'studentNo', header: '학번' },
    { accessorKey: 'studentName', header: '성명' },
    { accessorKey: 'teacherName', header: '부여자' },
    { accessorKey: 'reason', header: '사유' },
    { accessorKey: 'point', header: '점수' },
    { accessorKey: 'baseDate', header: '기준일' },
    { accessorKey: 'comment', header: '메모' },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <button
          className="table-action"
          type="button"
          onClick={() => cancelRecordMutation.mutate(row.original.id)}
          disabled={cancelRecordMutation.isPending}
        >
          취소
        </button>
      ),
    },
  ];

  const handleCreateRecord = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    createRecordMutation.mutate({
      studentId: Number(recordForm.studentId),
      reasonId: Number(recordForm.reasonId),
      comment: recordForm.comment,
      baseDate: recordForm.baseDate,
    });
  };

  const handleCreateReason = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    createReasonMutation.mutate({
      type: reasonForm.type,
      point: Number(reasonForm.point),
      comment: reasonForm.comment,
    });
  };

  if (summaryQuery.isLoading) {
    return <section className="admin-panel">상벌점 데이터를 불러오는 중입니다.</section>;
  }

  if (summaryQuery.isError || !summaryQuery.data) {
    return <section className="admin-panel error">상벌점 API 연결을 확인해주세요.</section>;
  }

  const summary = summaryQuery.data;
  const students = studentsQuery.data ?? [];
  const reasons = reasonsQuery.data ?? [];

  return (
    <div className="admin-stack">
      <section className="metric-grid compact">
        <article className="metric-card">
          <span>학생 수</span>
          <strong>{summary.totalStudents}</strong>
        </article>
        <article className="metric-card">
          <span>상점 합계</span>
          <strong>{summary.totalMeritPoints}</strong>
        </article>
        <article className="metric-card">
          <span>벌점 합계</span>
          <strong>{summary.totalPenaltyPoints}</strong>
        </article>
        <article className="metric-card">
          <span>주의 대상</span>
          <strong>{summary.watchListCount}</strong>
        </article>
      </section>

      <section className="admin-panel">
        <div className="panel-title">
          <h2>상벌점 부여</h2>
        </div>
        <form className="admin-form-grid" onSubmit={handleCreateRecord}>
          <label>
            <span>학생</span>
            <select
              value={recordForm.studentId}
              onChange={(event) =>
                setRecordForm((form) => ({ ...form, studentId: event.target.value }))
              }
              required
            >
              <option value="">선택</option>
              {students.map((student: StudentOption) => (
                <option key={student.id} value={student.id}>
                  {student.studentNo} {student.name} ({student.currentPoint}점)
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>사유</span>
            <select
              value={recordForm.reasonId}
              onChange={(event) =>
                setRecordForm((form) => ({ ...form, reasonId: event.target.value }))
              }
              required
            >
              <option value="">선택</option>
              {reasons.map((reason) => (
                <option key={reason.id} value={reason.id}>
                  {reason.comment} ({reason.point}점)
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>기준일</span>
            <input
              type="date"
              value={recordForm.baseDate}
              onChange={(event) =>
                setRecordForm((form) => ({ ...form, baseDate: event.target.value }))
              }
              required
            />
          </label>
          <label>
            <span>메모</span>
            <input
              value={recordForm.comment}
              onChange={(event) =>
                setRecordForm((form) => ({ ...form, comment: event.target.value }))
              }
              maxLength={255}
            />
          </label>
          <button
            className="primary-button"
            type="submit"
            disabled={createRecordMutation.isPending}
          >
            부여
          </button>
        </form>
        {createRecordMutation.isError ? (
          <p className="form-error">상벌점 부여에 실패했습니다.</p>
        ) : null}
      </section>

      <section className="admin-panel">
        <div className="panel-title">
          <h2>상벌점 기록</h2>
        </div>
        <DataTable columns={columns} data={summary.records} />
      </section>

      <section className="admin-panel">
        <div className="panel-title">
          <h2>사유 관리</h2>
        </div>
        <form className="admin-form-grid compact-form" onSubmit={handleCreateReason}>
          <label>
            <span>구분</span>
            <select
              value={reasonForm.type}
              onChange={(event) =>
                setReasonForm((form) => ({
                  ...form,
                  type: event.target.value as PointReason['type'],
                }))
              }
            >
              <option value="PLUS">상점</option>
              <option value="MINUS">벌점</option>
              <option value="ETC">기타</option>
            </select>
          </label>
          <label>
            <span>점수</span>
            <input
              type="number"
              value={reasonForm.point}
              onChange={(event) =>
                setReasonForm((form) => ({ ...form, point: event.target.value }))
              }
              required
            />
          </label>
          <label>
            <span>사유명</span>
            <input
              value={reasonForm.comment}
              onChange={(event) =>
                setReasonForm((form) => ({ ...form, comment: event.target.value }))
              }
              maxLength={255}
              required
            />
          </label>
          <button className="quiet-button" type="submit" disabled={createReasonMutation.isPending}>
            추가
          </button>
        </form>
        {createReasonMutation.isError ? (
          <p className="form-error">사유 추가에 실패했습니다.</p>
        ) : null}
        <div className="reason-grid">
          {reasons.map((reason) => (
            <article key={reason.id} className="reason-card">
              <strong>{reason.comment}</strong>
              <span>
                {reason.type} · {reason.point}점
              </span>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
