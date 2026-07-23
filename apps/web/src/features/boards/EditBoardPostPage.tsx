import type { FormEvent } from 'react';
import { useRef, useState } from 'react';
import type { BoardPostDetail } from '@jshsus/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { ArrowLeft, FileText, Paperclip, Save, Trash2 } from 'lucide-react';
import {
  hasTemporaryImageSources,
  plainTextToRichTextDocument,
  resolvePendingImages,
  RichTextEditor,
  stripPendingImages,
  type RichTextEditorValue,
} from '../../components/editor/RichTextEditor';
import { useToast } from '../../components/feedback/Toast';
import { PageScaffold, PageState } from '../../components/page/PageScaffold';
import { detailBreadcrumbs, taskBreadcrumbs } from '../../components/page/pageHierarchy';
import { uploadFile } from '../../shared/api/files';
import { ApiError } from '../../shared/api/http';
import {
  ALLOWED_ATTACHMENT_TYPES,
  ATTACHMENT_FORMAT_DESCRIPTION,
  ATTACHMENT_INPUT_ACCEPT,
} from '../../shared/lib/attachments';
import { getBoardPost, updateBoardPost } from './api';

const MAX_FILE_BYTES = 10 * 1024 * 1024;

function mutationErrorMessage(error: Error | null) {
  if (!error) return '로그인 상태와 입력 내용을 확인해 주세요.';
  if (error.message.includes('inline image')) {
    return '이미지 저장에 필요한 서버 기능을 확인해 주세요. 수정 내용은 저장되지 않았습니다.';
  }
  return '네트워크 상태를 확인한 뒤 다시 시도해 주세요.';
}

function BoardPostEditForm({ post }: { post: BoardPostDetail }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState(post.title);
  const [editorValue, setEditorValue] = useState<RichTextEditorValue>({
    contentDoc: post.contentDoc ?? plainTextToRichTextDocument(post.content),
    pendingImages: [],
    plainText: post.content,
  });
  const [attachments, setAttachments] = useState<File[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const uploadedImageUrls = new Map<string, string>();
      for (const pendingImage of editorValue.pendingImages) {
        const result = await uploadFile({
          file: pendingImage.file,
          targetType: 'post',
          targetId: post.id,
          visibility: 'public',
        });
        uploadedImageUrls.set(pendingImage.id, `/api/files/${result.file.id}/content`);
      }

      for (const file of attachments) {
        await uploadFile({
          file,
          targetType: 'post',
          targetId: post.id,
          visibility: 'public',
        });
      }

      const contentDoc = uploadedImageUrls.size
        ? resolvePendingImages(editorValue.contentDoc, uploadedImageUrls)
        : stripPendingImages(editorValue.contentDoc);
      if (hasTemporaryImageSources(contentDoc)) {
        throw new Error('inline image document contains a temporary URL');
      }

      return updateBoardPost({
        slug: 'free',
        postId: post.id,
        title: title.trim(),
        content: editorValue.plainText,
        contentDoc,
        isAnonymous: false,
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['board-post', 'free', post.id] }),
        queryClient.invalidateQueries({ queryKey: ['board-posts', 'free'] }),
        queryClient.invalidateQueries({ queryKey: ['home-dashboard'] }),
      ]);
      await navigate({ to: '/boards/free/$postId', params: { postId: String(post.id) } });
      showToast({ title: '게시글을 수정했습니다.', tone: 'success' });
    },
    onError: (error) =>
      showToast({
        title: '게시글을 수정하지 못했습니다.',
        description: mutationErrorMessage(error),
        tone: 'danger',
      }),
  });

  const addAttachments = (files: FileList | null) => {
    setAttachmentError(null);
    if (!files?.length) return;

    const accepted: File[] = [];
    for (const file of [...files]) {
      if (!ALLOWED_ATTACHMENT_TYPES.has(file.type)) {
        setAttachmentError(`${ATTACHMENT_FORMAT_DESCRIPTION} 파일만 첨부할 수 있습니다.`);
        continue;
      }
      if (file.size > MAX_FILE_BYTES) {
        setAttachmentError('첨부 파일은 한 개당 10MB 이하여야 합니다.');
        continue;
      }
      if (
        !attachments.some(
          (item) =>
            item.name === file.name &&
            item.size === file.size &&
            item.lastModified === file.lastModified,
        )
      ) {
        accepted.push(file);
      }
    }
    setAttachments((current) => [...current, ...accepted]);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!mutation.isPending) mutation.mutate();
  };
  const hasContent = Boolean(editorValue.plainText || editorValue.pendingImages.length);

  return (
    <form className="editor-surface" onSubmit={submit}>
      <div className="editor-field">
        <label htmlFor="board-post-title">제목</label>
        <input
          autoFocus
          id="board-post-title"
          maxLength={255}
          onChange={(event) => setTitle(event.target.value)}
          required
          type="text"
          value={title}
        />
      </div>

      <div className="editor-field">
        <label htmlFor="board-post-content">내용</label>
        <RichTextEditor
          id="board-post-content"
          allowPoll
          initialValue={post.contentDoc ?? plainTextToRichTextDocument(post.content)}
          onChange={setEditorValue}
        />
      </div>

      <section className="editor-attachments" aria-labelledby="attachment-title">
        <div className="editor-attachments__heading">
          <div>
            <h2 id="attachment-title">첨부 파일</h2>
            <p>{ATTACHMENT_FORMAT_DESCRIPTION} · 기존 첨부 파일은 유지됩니다.</p>
          </div>
          <button
            className="editor-file-button"
            onClick={() => attachmentInputRef.current?.click()}
            type="button"
          >
            <Paperclip size={16} /> 파일 선택
          </button>
          <input
            ref={attachmentInputRef}
            accept={ATTACHMENT_INPUT_ACCEPT}
            className="sr-only"
            multiple
            onChange={(event) => {
              addAttachments(event.target.files);
              event.target.value = '';
            }}
            tabIndex={-1}
            type="file"
          />
        </div>
        {attachments.length ? (
          <ul className="editor-attachment-list">
            {attachments.map((file, index) => (
              <li key={`${file.name}-${file.lastModified}-${index}`}>
                <FileText size={16} />
                <span>{file.name}</span>
                <small>{(file.size / 1024 / 1024).toFixed(1)}MB</small>
                <button
                  aria-label={`${file.name} 삭제`}
                  onClick={() =>
                    setAttachments((current) =>
                      current.filter((_, itemIndex) => itemIndex !== index),
                    )
                  }
                  type="button"
                >
                  <Trash2 size={15} />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {attachmentError ? <p className="editor-option-error">{attachmentError}</p> : null}
      </section>

      <div className="editor-actions">
        <Link
          className="detail-secondary-button"
          to="/boards/free/$postId"
          params={{ postId: String(post.id) }}
        >
          <ArrowLeft size={16} /> 취소
        </Link>
        <button
          className="detail-primary-button"
          disabled={mutation.isPending || !title.trim() || !hasContent}
          type="submit"
        >
          <Save size={16} /> {mutation.isPending ? '저장 중' : '저장'}
        </button>
      </div>
    </form>
  );
}

export function EditBoardPostPage() {
  const { postId } = useParams({ from: '/boards/free/$postId/edit' });
  const numericId = Number(postId);
  const postQuery = useQuery({
    queryKey: ['board-post', 'free', numericId],
    queryFn: () => getBoardPost('free', numericId),
    enabled: Number.isInteger(numericId) && numericId > 0,
  });

  if (postQuery.isLoading) {
    return <PageState kind="loading" title="게시글을 불러오는 중입니다." />;
  }

  if (postQuery.isError || !postQuery.data) {
    const status = postQuery.error instanceof ApiError ? postQuery.error.status : undefined;
    return (
      <PageScaffold
        breadcrumbs={detailBreadcrumbs('board')}
        title={status === 404 ? '게시글을 찾을 수 없습니다' : '게시글을 불러오지 못했습니다'}
        width="reading"
        variant="document"
      >
        <PageState
          kind="error"
          variant="page"
          title={
            status === 404
              ? '삭제되었거나 존재하지 않는 게시글입니다.'
              : '잠시 후 다시 시도해 주세요.'
          }
          action={
            <Link className="detail-secondary-button" to="/boards/free">
              게시판으로
            </Link>
          }
        />
      </PageScaffold>
    );
  }

  if (!postQuery.data.canEdit) {
    return (
      <PageScaffold
        breadcrumbs={detailBreadcrumbs('board')}
        title="게시글을 수정할 수 없습니다"
        width="reading"
        variant="document"
      >
        <PageState
          kind="error"
          variant="page"
          title="작성자만 게시글을 수정할 수 있습니다."
          action={
            <Link className="detail-secondary-button" to="/boards/free/$postId" params={{ postId }}>
              게시글로 돌아가기
            </Link>
          }
        />
      </PageScaffold>
    );
  }

  return (
    <PageScaffold
      breadcrumbs={taskBreadcrumbs('board', '글쓰기')}
      title="게시글 수정"
      width="reading"
      variant="form"
    >
      <BoardPostEditForm post={postQuery.data} />
    </PageScaffold>
  );
}
