import type { FormEvent } from 'react';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { ArrowLeft, ExternalLink, LoaderCircle, Save, Search } from 'lucide-react';
import { PageScaffold, PageState } from '../../components/page/PageScaffold';
import { detailBreadcrumbs, taskBreadcrumbs } from '../../components/page/pageHierarchy';
import { ApiError } from '../../shared/api/http';
import { getSession } from '../auth/api';
import {
  getJbsPost,
  previewJbsVideo,
  updateJbsPost,
  type JbsPost,
  type JbsVideoPreview,
} from './api';
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

function JbsVideoPreviewBox({
  embedUrl,
  meta,
  title,
  url,
}: {
  embedUrl: string;
  meta?: JbsVideoPreview;
  title: string;
  url: string;
}) {
  return (
    <div className="jbs-form__preview">
      <div className="jbs-player">
        <iframe
          src={embedUrl}
          title={`${title} 미리보기`}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
        />
      </div>
      <div className="jbs-form__video-meta">
        <div>
          <strong>{meta?.title ?? title}</strong>
          <span>
            {meta
              ? `${meta.channelTitle ?? '채널 정보 없음'} · ${formatDuration(meta.durationSeconds)}`
              : '현재 등록된 영상'}
          </span>
        </div>
        <a href={url} target="_blank" rel="noreferrer">
          YouTube에서 확인 <ExternalLink size={14} aria-hidden="true" />
        </a>
      </div>
    </div>
  );
}

function JbsEditForm({ post }: { post: JbsPost }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(post.title);
  const [description, setDescription] = useState(post.description);
  const [youtubeUrl, setYoutubeUrl] = useState(post.canonicalUrl);
  const [previewFor, setPreviewFor] = useState('');
  const previewMutation = useMutation({ mutationFn: previewJbsVideo });
  const updateMutation = useMutation({
    mutationFn: () =>
      updateJbsPost(post.id, {
        title: title.trim(),
        description: description.trim(),
        youtubeUrl: youtubeUrl.trim(),
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['jbs-post', post.id] }),
        queryClient.invalidateQueries({ queryKey: ['jbs-posts'] }),
        queryClient.invalidateQueries({ queryKey: ['home-dashboard'] }),
      ]);
      await navigate({ to: '/jbs/$postId', params: { postId: String(post.id) } });
    },
  });

  const normalizedUrl = youtubeUrl.trim();
  const preview = previewFor === normalizedUrl ? previewMutation.data : undefined;

  const checkVideo = () => {
    if (!normalizedUrl) return;
    setPreviewFor('');
    previewMutation.mutate(normalizedUrl, {
      onSuccess: () => setPreviewFor(normalizedUrl),
    });
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim() || !description.trim() || !normalizedUrl) return;
    updateMutation.mutate();
  };

  return (
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
        <JbsVideoPreviewBox
          embedUrl={preview.embedUrl}
          meta={preview}
          title={preview.title}
          url={preview.canonicalUrl}
        />
      ) : (
        <JbsVideoPreviewBox embedUrl={post.embedUrl} title={post.title} url={post.canonicalUrl} />
      )}

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
        <Link
          className="detail-secondary-button"
          to="/jbs/$postId"
          params={{ postId: String(post.id) }}
        >
          <ArrowLeft size={16} aria-hidden="true" /> 취소
        </Link>
        <button
          className="detail-primary-button"
          type="submit"
          disabled={
            updateMutation.isPending || !title.trim() || !description.trim() || !normalizedUrl
          }
        >
          <Save size={16} aria-hidden="true" /> {updateMutation.isPending ? '저장 중' : '저장'}
        </button>
      </div>
      <p className="mutation-feedback" role="status" aria-live="polite">
        {updateMutation.isError ? describeError(updateMutation.error) : null}
      </p>
    </form>
  );
}

export function EditJbsPostPage() {
  const { postId } = useParams({ from: '/jbs/$postId/edit' });
  const numericId = Number(postId);
  const postQuery = useQuery({
    queryKey: ['jbs-post', numericId],
    queryFn: () => getJbsPost(numericId),
    enabled: Number.isInteger(numericId) && numericId > 0,
  });
  const sessionQuery = useQuery({ queryKey: ['session'], queryFn: getSession });
  const session = sessionQuery.data;
  const canPublish =
    session?.isLogined &&
    (session.roles?.includes('system_admin') || session.permissions.includes('jbs.publish'));

  if (postQuery.isLoading || sessionQuery.isLoading) {
    return <PageState kind="loading" title="영상을 불러오는 중입니다." />;
  }

  if (postQuery.isError || !postQuery.data) {
    const status = postQuery.error instanceof ApiError ? postQuery.error.status : undefined;
    return (
      <PageScaffold
        breadcrumbs={detailBreadcrumbs('jbs')}
        title={status === 404 ? '영상을 찾을 수 없습니다' : '영상을 불러오지 못했습니다'}
        width="reading"
        variant="document"
      >
        <PageState
          kind="error"
          variant="page"
          title={
            status === 404
              ? '삭제되었거나 존재하지 않는 영상입니다.'
              : '잠시 후 다시 시도해 주세요.'
          }
          action={
            <Link className="detail-secondary-button" to="/jbs">
              JBS로 돌아가기
            </Link>
          }
        />
      </PageScaffold>
    );
  }

  if (!canPublish || !postQuery.data.canEdit) {
    return (
      <PageScaffold
        breadcrumbs={detailBreadcrumbs('jbs')}
        title="영상을 수정할 수 없습니다"
        width="reading"
        variant="document"
      >
        <PageState
          kind="error"
          variant="page"
          title="작성자만 JBS 영상을 수정할 수 있습니다."
          action={
            <Link className="detail-secondary-button" to="/jbs/$postId" params={{ postId }}>
              영상으로 돌아가기
            </Link>
          }
        />
      </PageScaffold>
    );
  }

  return (
    <PageScaffold
      breadcrumbs={taskBreadcrumbs('jbs', '수정')}
      title="JBS 영상 수정"
      width="reading"
      variant="form"
    >
      <JbsEditForm post={postQuery.data} />
    </PageScaffold>
  );
}
