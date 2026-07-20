import type { FormEvent } from 'react';
import { useMemo, useState } from 'react';
import type { PetitionDetail } from '@jshsus/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { ArrowLeft, Save } from 'lucide-react';
import {
  plainTextToRichTextDocument,
  RichTextEditor,
  stripPendingImages,
  type RichTextEditorValue,
} from '../../components/editor/RichTextEditor';
import { useToast } from '../../components/feedback/Toast';
import { PageScaffold, PageState } from '../../components/page/PageScaffold';
import { detailBreadcrumbs, taskBreadcrumbs } from '../../components/page/pageHierarchy';
import { ApiError } from '../../shared/api/http';
import { parsePositiveRouteId } from '../../shared/lib/route';
import { getPetition, updatePetition } from './api';
import '../../styles/petitions.css';

function authoredContentLength(plainText: string) {
  return plainText.replace(/\s/g, '').length;
}

function PetitionEditForm({ petition }: { petition: PetitionDetail }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [title, setTitle] = useState(petition.title);
  const [editorValue, setEditorValue] = useState<RichTextEditorValue>({
    contentDoc: petition.contentDoc ?? plainTextToRichTextDocument(petition.content),
    pendingImages: [],
    plainText: petition.content,
  });
  const [attempted, setAttempted] = useState(false);

  const errors = useMemo(() => {
    const next: { title?: string; content?: string } = {};
    const normalizedTitle = title.trim();
    const bodyLength = authoredContentLength(editorValue.plainText);

    if (!normalizedTitle) next.title = '제안 제목을 입력해 주세요.';
    else if (normalizedTitle.length < 5) next.title = '제안 제목을 5자 이상 입력해 주세요.';
    if (bodyLength < 20) next.content = '문제와 제안 내용을 합해 20자 이상 작성해 주세요.';
    return next;
  }, [editorValue.plainText, title]);

  const mutation = useMutation({
    mutationFn: () =>
      updatePetition(petition.id, {
        title: title.trim(),
        content: editorValue.plainText.trim(),
        contentDoc: stripPendingImages(editorValue.contentDoc),
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['petitions'] }),
        queryClient.invalidateQueries({ queryKey: ['petitions', 'detail', petition.id] }),
        queryClient.invalidateQueries({ queryKey: ['home-dashboard'] }),
      ]);
      await navigate({
        to: '/petitions/$petitionId',
        params: { petitionId: String(petition.id) },
      });
      showToast({ title: '청원·제안을 수정했습니다.', tone: 'success' });
    },
    onError: () =>
      showToast({
        title: '청원·제안을 수정하지 못했습니다.',
        description: '이미 참여가 시작된 청원은 수정할 수 없습니다.',
        tone: 'danger',
      }),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setAttempted(true);
    if (Object.keys(errors).length) return;
    mutation.mutate();
  };

  return (
    <form className="petition-form" onSubmit={submit} noValidate>
      <section className="petition-form-section" aria-labelledby="petition-basic-title">
        <div className="petition-form-section__heading">
          <span>1</span>
          <div>
            <h2 id="petition-basic-title">제안 기본 정보</h2>
            <p>학생들이 내용을 바로 이해할 수 있는 제목을 적어 주세요.</p>
          </div>
        </div>
        <div className="petition-form-field">
          <label htmlFor="petition-title">제안 제목</label>
          <input
            id="petition-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={255}
            aria-invalid={attempted && Boolean(errors.title)}
            aria-describedby={attempted && errors.title ? 'petition-title-error' : undefined}
            autoFocus
          />
          <div className="petition-form-field__meta">
            {attempted && errors.title ? (
              <span className="petition-form-field__error" id="petition-title-error">
                {errors.title}
              </span>
            ) : (
              <span />
            )}
            <span>{title.length} / 255</span>
          </div>
        </div>
      </section>

      <section className="petition-form-section" aria-labelledby="petition-content-title">
        <div className="petition-form-section__heading">
          <span>2</span>
          <div>
            <h2 id="petition-content-title">제안 내용</h2>
            <p>현재 문제, 제안 내용, 기대 효과 순서로 작성해 주세요.</p>
          </div>
        </div>
        <div className={`petition-rich-editor${attempted && errors.content ? ' is-invalid' : ''}`}>
          <RichTextEditor
            id="petition-content"
            initialValue={petition.contentDoc ?? plainTextToRichTextDocument(petition.content)}
            ariaLabel="청원 제안 내용"
            allowImages={false}
            onChange={setEditorValue}
            placeholder=""
          />
        </div>
        {attempted && errors.content ? (
          <p className="petition-form-field__error" role="alert">
            {errors.content}
          </p>
        ) : null}
      </section>

      <p className="petition-form-notice">
        이미 참여가 시작된 청원은 수정할 수 없습니다. 삭제가 필요하면 상세 화면의 메뉴를 이용하세요.
      </p>

      <div className="petition-form-actions">
        <Link
          className="detail-secondary-button"
          to="/petitions/$petitionId"
          params={{ petitionId: String(petition.id) }}
        >
          <ArrowLeft size={16} aria-hidden="true" /> 취소
        </Link>
        <button className="detail-primary-button" type="submit" disabled={mutation.isPending}>
          <Save size={16} aria-hidden="true" />
          {mutation.isPending ? '저장 중' : '저장'}
        </button>
      </div>
    </form>
  );
}

export function EditPetitionPage() {
  const { petitionId } = useParams({ from: '/petitions/$petitionId/edit' });
  const parsedId = parsePositiveRouteId(petitionId);
  const id = parsedId ?? 0;
  const petitionQuery = useQuery({
    queryKey: ['petitions', 'detail', id],
    queryFn: () => getPetition(id),
    enabled: parsedId !== null,
  });

  if (petitionQuery.isLoading) {
    return <PageState kind="loading" title="청원·제안을 불러오는 중입니다." />;
  }

  if (petitionQuery.isError || !petitionQuery.data) {
    const status = petitionQuery.error instanceof ApiError ? petitionQuery.error.status : undefined;
    return (
      <PageScaffold
        breadcrumbs={detailBreadcrumbs('petitions')}
        title={status === 404 ? '청원·제안을 찾을 수 없습니다' : '청원·제안을 불러오지 못했습니다'}
        width="reading"
        variant="document"
      >
        <PageState
          kind="error"
          variant="page"
          title={
            status === 404
              ? '삭제되었거나 공개되지 않은 청원·제안입니다.'
              : '잠시 후 다시 시도해 주세요.'
          }
          action={
            <Link className="detail-secondary-button" to="/petitions">
              청원·제안 목록으로
            </Link>
          }
        />
      </PageScaffold>
    );
  }

  if (!petitionQuery.data.canEdit) {
    return (
      <PageScaffold
        breadcrumbs={detailBreadcrumbs('petitions')}
        title="청원·제안을 수정할 수 없습니다"
        width="reading"
        variant="document"
      >
        <PageState
          kind="error"
          variant="page"
          title="작성자만 청원·제안을 수정할 수 있습니다."
          action={
            <Link
              className="detail-secondary-button"
              to="/petitions/$petitionId"
              params={{ petitionId }}
            >
              청원·제안으로 돌아가기
            </Link>
          }
        />
      </PageScaffold>
    );
  }

  return (
    <PageScaffold
      breadcrumbs={taskBreadcrumbs('petitions', '수정')}
      title="청원·제안 수정"
      description="제목과 내용을 수정하세요."
      width="reading"
      variant="form"
    >
      <PetitionEditForm petition={petitionQuery.data} />
    </PageScaffold>
  );
}
