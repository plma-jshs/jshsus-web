import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { PageScaffold, PageState } from '../../components/page/PageScaffold';
import { taskBreadcrumbs } from '../../components/page/pageHierarchy';
import { createDormReport, getMyDorm } from './api';
import '../../styles/dorm.css';

export function NewDormReportPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const dormQuery = useQuery({ queryKey: ['my-dorm'], queryFn: getMyDorm });
  const [description, setDescription] = useState('');
  const reportMutation = useMutation({
    mutationFn: () => createDormReport(description),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['my-dorm'] });
      await navigate({ to: '/dorm' });
    },
  });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!description.trim()) return;
    reportMutation.mutate();
  };

  const currentAssignment = dormQuery.data?.currentAssignment;

  return (
    <PageScaffold
      breadcrumbs={taskBreadcrumbs('dorm', '민원 등록')}
      title="기숙사 민원 등록"
      width="reading"
      variant="form"
    >
      {dormQuery.isLoading ? (
        <PageState kind="loading" variant="section" title="기숙사 정보를 불러오는 중입니다." />
      ) : null}
      {dormQuery.isError ? (
        <PageState
          kind="error"
          variant="section"
          title="기숙사 정보를 불러오지 못했습니다."
          description="잠시 후 다시 시도해 주세요."
        />
      ) : null}
      {dormQuery.data ? (
        <form className="dorm-report-form" onSubmit={submit}>
          <div className="dorm-report-form__context">
            <span>민원 대상</span>
            <strong>
              {currentAssignment
                ? `${currentAssignment.dormName} ${currentAssignment.roomName}`
                : '현재 학기 기숙사 배정 없음'}
            </strong>
          </div>
          <label className="dorm-report-form__field">
            <span>민원 내용</span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="기숙사 생활 중 불편한 점이나 요청 사항을 입력해 주세요."
              maxLength={500}
              rows={7}
              required
            />
            <small>{description.length}/500</small>
          </label>
          {reportMutation.isError ? (
            <p className="dorm-report-form__error" role="alert">
              민원을 등록하지 못했습니다. 잠시 후 다시 시도해 주세요.
            </p>
          ) : null}
          <div className="dorm-report-form__actions">
            <Link className="detail-secondary-button" to="/dorm">
              취소
            </Link>
            <button
              className="detail-primary-button"
              type="submit"
              disabled={!description.trim() || reportMutation.isPending || !currentAssignment}
            >
              {reportMutation.isPending ? '등록 중…' : '등록'}
            </button>
          </div>
        </form>
      ) : null}
    </PageScaffold>
  );
}
