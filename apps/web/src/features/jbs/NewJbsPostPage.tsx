import type { FormEvent } from 'react';
import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, ExternalLink, LoaderCircle, Search, Send } from 'lucide-react';
import { PageScaffold, PageState } from '../../components/page/PageScaffold';
import { taskBreadcrumbs } from '../../components/page/pageHierarchy';
import { ApiError } from '../../shared/api/http';
import { getSession } from '../auth/api';
import { createJbsPost, previewJbsVideo } from './api';
import './jbs.css';

function describeError(error: unknown) {
  if (error instanceof ApiError && error.payload && typeof error.payload === 'object') {
    const message = (error.payload as { message?: unknown }).message;
    if (typeof message === 'string') return message;
  }
  return '영상 정보를 확인하지 못했습니다. URL과 API 설정을 확인해 주세요.';
}

function formatDuration(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function NewJbsPostPage() {
  const navigate = useNavigate({ from: '/jbs/new' });
  const sessionQuery = useQuery({ queryKey: ['session'], queryFn: getSession });
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [previewFor, setPreviewFor] = useState('');
  const previewMutation = useMutation({ mutationFn: previewJbsVideo });
  const createMutation = useMutation({
    mutationFn: createJbsPost,
    onSuccess: (result) => {
      void navigate({ to: '/jbs/$postId', params: { postId: String(result.post.id) } });
    },
  });

  const normalizedUrl = youtubeUrl.trim();
  const preview = previewFor === normalizedUrl ? previewMutation.data : undefined;
  const session = sessionQuery.data;
  const canPublish =
    session?.isLogined &&
    (session.roles?.includes('system_admin') || session.permissions.includes('jbs.publish'));

  if (sessionQuery.isLoading) {
    return <PageState kind="loading" title="권한을 확인하는 중입니다." />;
  }
  if (!canPublish) {
    return (
      <PageScaffold
        breadcrumbs={taskBreadcrumbs('jbs', '영상 등록')}
        title="영상 등록 권한이 없습니다"
        width="reading"
        variant="document"
      >
        <PageState
          kind="error"
          variant="page"
          title="방송부 권한이 있는 계정만 JBS 영상을 등록할 수 있습니다."
          action={
            <Link className="detail-secondary-button" to="/jbs">
              JBS로 돌아가기
            </Link>
          }
        />
      </PageScaffold>
    );
  }

  const checkVideo = () => {
    if (!normalizedUrl) return;
    setPreviewFor('');
    previewMutation.mutate(normalizedUrl, {
      onSuccess: () => setPreviewFor(normalizedUrl),
    });
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim() || !description.trim() || !preview) return;
    createMutation.mutate({
      title: title.trim(),
      description: description.trim(),
      youtubeUrl: preview.canonicalUrl,
    });
  };

  return (
    <PageScaffold
      breadcrumbs={taskBreadcrumbs('jbs', '영상 등록')}
      title="JBS 영상 등록"
      description="YouTube URL과 게시글 내용을 입력하세요."
      width="reading"
      variant="form"
    >
      <form className="jbs-form" onSubmit={submit}>
        <label>
          <span>제목</span>
          <input
            value={title}
            maxLength={150}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="게시물 제목을 입력하세요"
            required
          />
        </label>

        <label>
          <span>YouTube URL</span>
          <div className="jbs-form__url-row">
            <input
              value={youtubeUrl}
              maxLength={500}
              onChange={(event) => {
                setYoutubeUrl(event.target.value);
                setPreviewFor('');
              }}
              placeholder="https://www.youtube.com/watch?v=..."
              inputMode="url"
              required
            />
            <button
              className="detail-secondary-button"
              type="button"
              onClick={checkVideo}
              disabled={!normalizedUrl || previewMutation.isPending}
            >
              {previewMutation.isPending ? (
                <LoaderCircle className="spin" size={16} aria-hidden="true" />
              ) : (
                <Search size={16} aria-hidden="true" />
              )}
              영상 확인
            </button>
          </div>
          {previewMutation.isError ? (
            <small className="jbs-form__error" role="alert">
              {describeError(previewMutation.error)}
            </small>
          ) : null}
        </label>

        {preview ? (
          <div className="jbs-form__preview">
            <div className="jbs-player">
              <iframe
                src={preview.embedUrl}
                title={`${preview.title} 미리보기`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
              />
            </div>
            <div className="jbs-form__video-meta">
              <div>
                <strong>{preview.title}</strong>
                <span>
                  {preview.channelTitle ?? '채널 정보 없음'} ·{' '}
                  {formatDuration(preview.durationSeconds)}
                </span>
              </div>
              <a href={preview.canonicalUrl} target="_blank" rel="noreferrer">
                YouTube에서 확인 <ExternalLink size={14} aria-hidden="true" />
              </a>
            </div>
          </div>
        ) : null}

        <label>
          <span>설명</span>
          <textarea
            value={description}
            maxLength={5000}
            rows={8}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="영상 내용을 간단히 소개해 주세요"
            required
          />
          <small>{description.length.toLocaleString('ko-KR')} / 5,000자</small>
        </label>

        <div className="jbs-form__actions">
          <Link className="detail-secondary-button" to="/jbs">
            <ArrowLeft size={16} aria-hidden="true" /> 취소
          </Link>
          <button
            className="detail-primary-button"
            type="submit"
            disabled={createMutation.isPending || !title.trim() || !description.trim() || !preview}
          >
            <Send size={16} aria-hidden="true" /> 등록
          </button>
        </div>
        <p className="mutation-feedback" role="status" aria-live="polite">
          {createMutation.isError ? describeError(createMutation.error) : null}
        </p>
      </form>
    </PageScaffold>
  );
}
