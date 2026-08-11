import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';
import {
  plainTextToRichTextDocument,
  RichTextEditor,
  type RichTextEditorValue,
} from '../../components/editor/RichTextEditor';
import { PageScaffold, PageState } from '../../components/page/PageScaffold';
import { taskBreadcrumbs } from '../../components/page/pageHierarchy';
import { createDormReport, getMyDorm } from './api';
import '../../styles/dorm.css';

const emptyEditorValue: RichTextEditorValue = {
  contentDoc: plainTextToRichTextDocument(''),
  pendingImages: [],
  plainText: '',
};

export function NewDormReportPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const dormQuery = useQuery({ queryKey: ['my-dorm'], queryFn: getMyDorm });
  const [title, setTitle] = useState('');
  const [editorValue, setEditorValue] = useState<RichTextEditorValue>(emptyEditorValue);

  const reportText = [title.trim(), editorValue.plainText.trim()].filter(Boolean).join('\n\n');
  const hasContent = Boolean(title.trim() && editorValue.plainText.trim());
  const isTooLong = reportText.length > 500;
  const currentAssignment = dormQuery.data?.currentAssignment;

  const reportMutation = useMutation({
    mutationFn: () => createDormReport(reportText),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['my-dorm'] });
      await navigate({ to: '/dorm' });
    },
  });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!hasContent || isTooLong || !currentAssignment || reportMutation.isPending) return;
    reportMutation.mutate();
  };

  return (
    <PageScaffold
      breadcrumbs={taskBreadcrumbs('dorm', '민원 등록')}
      title="민원 등록"
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
        <form className="editor-surface dorm-report-editor" id="editor-form" onSubmit={submit}>
          <div className="editor-field editor-title-field">
            <label className="sr-only" htmlFor="dorm-report-title">
              제목
            </label>
            <input
              autoFocus
              className="editor-title-input"
              id="dorm-report-title"
              maxLength={120}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="제목을 입력하세요"
              required
              type="text"
              value={title}
            />
          </div>

          <div className="editor-field">
            <label className="sr-only" htmlFor="dorm-report-content">
              내용
            </label>
            <RichTextEditor
              id="dorm-report-content"
              initialValue={editorValue.contentDoc}
              onChange={setEditorValue}
              placeholder="내용을 입력하세요"
            />
          </div>

          <p className="dorm-report-editor__context">
            {currentAssignment
              ? `${currentAssignment.dormName} ${currentAssignment.roomName} 민원`
              : '현재 학기 기숙사 배정이 없어 민원을 등록할 수 없습니다.'}
          </p>

          {isTooLong ? (
            <p className="dorm-report-form__error" role="alert">
              민원 내용은 500자 이내로 입력해 주세요.
            </p>
          ) : null}
          {reportMutation.isError ? (
            <p className="dorm-report-form__error" role="alert">
              민원을 등록하지 못했습니다. 잠시 후 다시 시도해 주세요.
            </p>
          ) : null}

          <div className="editor-actions dorm-report-editor__actions">
            <button
              className="detail-secondary-button"
              onClick={() => void navigate({ to: '/dorm' })}
              type="button"
            >
              취소
            </button>
            <button
              className="detail-primary-button"
              disabled={!hasContent || isTooLong || reportMutation.isPending || !currentAssignment}
              type="submit"
            >
              {reportMutation.isPending ? '등록 중' : '등록'}
            </button>
          </div>
        </form>
      ) : null}
    </PageScaffold>
  );
}
