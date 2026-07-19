import type { FormEvent } from 'react';
import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ArrowLeft, CheckCircle2, Send } from 'lucide-react';
import {
  RichTextEditor,
  type RichTextEditorValue,
  stripPendingImages,
} from '../../components/editor/RichTextEditor';
import { PageScaffold } from '../../components/page/PageScaffold';
import { taskBreadcrumbs } from '../../components/page/pageHierarchy';
import { createPetition } from './api';
import '../../styles/petitions.css';

function toDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function offsetDate(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return toDateInput(date);
}

function authoredContentLength(plainText: string) {
  return plainText.replace(/\s/g, '').length;
}

export function NewPetitionPage() {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [editorValue, setEditorValue] = useState<RichTextEditorValue | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [attempted, setAttempted] = useState(false);

  const errors = useMemo(() => {
    const next: { title?: string; content?: string } = {};
    const normalizedTitle = title.trim();
    const bodyLength = authoredContentLength(editorValue?.plainText ?? '');

    if (!normalizedTitle) next.title = '제안 제목을 입력해 주세요.';
    else if (normalizedTitle.length < 5) next.title = '제안 제목을 5자 이상 입력해 주세요.';
    if (bodyLength < 20) next.content = '문제와 제안 내용을 합해 20자 이상 작성해 주세요.';
    return next;
  }, [editorValue?.plainText, title]);

  const mutation = useMutation({
    mutationFn: () => {
      if (!editorValue) throw new Error('Petition content is required.');
      return createPetition({
        title: title.trim(),
        content: editorValue.plainText.trim(),
        contentDoc: stripPendingImages(editorValue.contentDoc),
        endsAt: `${offsetDate(30)}T23:59:59+09:00`,
      });
    },
    onSuccess: async () => {
      setSubmitted(true);
      await queryClient.invalidateQueries({ queryKey: ['petitions'] });
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setAttempted(true);
    if (Object.keys(errors).length || !editorValue) return;
    mutation.mutate();
  };

  if (submitted && mutation.data) {
    return (
      <PageScaffold
        breadcrumbs={taskBreadcrumbs('petitions', '등록')}
        title="청원·제안이 등록되었습니다"
        description="등록된 내용은 청원·제안 목록에서 확인할 수 있습니다."
        width="reading"
        variant="form"
      >
        <section className="petition-submit-success" role="status">
          <CheckCircle2 size={28} aria-hidden="true" />
          <div>
            <strong>{title.trim()}</strong>
            <p>등록된 내용을 한 번 더 확인해 주세요.</p>
          </div>
          <Link
            className="detail-primary-button"
            to="/petitions/$petitionId"
            params={{ petitionId: String(mutation.data.petition.id) }}
          >
            제안 확인하기
          </Link>
        </section>
      </PageScaffold>
    );
  }

  return (
    <PageScaffold
      breadcrumbs={taskBreadcrumbs('petitions', '등록')}
      title="청원·제안 등록"
      description="제목과 내용을 입력하세요. 참여 기간은 등록일부터 30일로 자동 설정됩니다."
      width="reading"
      variant="form"
    >
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
          <div
            className={`petition-rich-editor${attempted && errors.content ? ' is-invalid' : ''}`}
          >
            <RichTextEditor
              id="petition-content"
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
          등록한 제안은 학생들에게 공개됩니다. 개인정보, 비방 또는 개인을 특정하는 내용은 포함하지
          마세요.
        </p>

        {mutation.isError ? (
          <div className="petition-form-error" role="alert">
            <strong>제안을 등록하지 못했습니다.</strong>
            <span>로그인 상태와 입력 내용을 확인한 뒤 다시 시도해 주세요.</span>
          </div>
        ) : null}

        <div className="petition-form-actions">
          <Link className="detail-secondary-button" to="/petitions">
            <ArrowLeft size={16} aria-hidden="true" /> 취소
          </Link>
          <button className="detail-primary-button" type="submit" disabled={mutation.isPending}>
            <Send size={16} aria-hidden="true" />
            {mutation.isPending ? '등록 중' : '등록'}
          </button>
        </div>
      </form>
    </PageScaffold>
  );
}
