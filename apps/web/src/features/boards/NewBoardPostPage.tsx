import type { FormEvent } from 'react';
import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, FileText, Paperclip, Send, Trash2 } from 'lucide-react';
import {
  hasTemporaryImageSources,
  plainTextToRichTextDocument,
  resolvePendingImages,
  RichTextEditor,
  stripPendingImages,
  type RichTextEditorValue,
} from '../../components/editor/RichTextEditor';
import { PageScaffold, PageState } from '../../components/page/PageScaffold';
import { uploadFile } from '../../shared/api/files';
import {
  createBoardPost,
  createBoardPostDraft,
  deleteBoardPostDraft,
  publishBoardPost,
  updateBoardPost,
} from './api';

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_ATTACHMENT_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

const emptyEditorValue: RichTextEditorValue = {
  contentDoc: plainTextToRichTextDocument(''),
  pendingImages: [],
  plainText: '',
};

function mutationErrorMessage(error: Error | null) {
  if (!error) return '로그인 상태와 입력 내용을 확인해 주세요.';
  if (error.message.includes('inline image')) {
    return '이미지 저장에 필요한 서버 기능을 확인해 주세요. 작성 중인 글은 공개되지 않았습니다.';
  }
  return '네트워크 상태를 확인한 뒤 다시 시도해 주세요. 작성 중인 글은 공개되지 않습니다.';
}

export function NewBoardPostPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState('');
  const [editorValue, setEditorValue] = useState<RichTextEditorValue>(emptyEditorValue);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const baseInput = {
        slug: 'free',
        title: title.trim(),
        content: editorValue.plainText,
        contentDoc: stripPendingImages(editorValue.contentDoc),
        isAnonymous,
      };
      const needsDraft = editorValue.pendingImages.length > 0 || attachments.length > 0;

      if (!needsDraft) return createBoardPost(baseInput);

      let draftId: number | null = null;
      try {
        const draft = await createBoardPostDraft(baseInput);
        draftId = draft.post.id;
        const uploadedImageUrls = new Map<string, string>();

        for (const pendingImage of editorValue.pendingImages) {
          const result = await uploadFile({
            file: pendingImage.file,
            targetType: 'post',
            targetId: draftId,
            visibility: 'private',
          });
          const inlineUrl = `/api/files/${result.file.id}/content`;
          uploadedImageUrls.set(pendingImage.id, inlineUrl);
        }

        for (const file of attachments) {
          await uploadFile({
            file,
            targetType: 'post',
            targetId: draftId,
            visibility: 'private',
          });
        }

        const contentDoc = resolvePendingImages(editorValue.contentDoc, uploadedImageUrls);
        if (hasTemporaryImageSources(contentDoc)) {
          throw new Error('inline image document contains a temporary URL');
        }

        await updateBoardPost({
          ...baseInput,
          postId: draftId,
          contentDoc,
        });
        return await publishBoardPost('free', draftId);
      } catch (error) {
        if (draftId) {
          await deleteBoardPostDraft('free', draftId).catch(() => undefined);
        }
        throw error;
      }
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['board-posts', 'free'] });
      await navigate({ to: '/boards/free/$postId', params: { postId: String(result.post.id) } });
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!mutation.isPending) mutation.mutate();
  };

  const addAttachments = (files: FileList | null) => {
    setAttachmentError(null);
    if (!files?.length) return;

    const accepted: File[] = [];
    for (const file of [...files]) {
      if (!ALLOWED_ATTACHMENT_TYPES.has(file.type)) {
        setAttachmentError('PDF, JPG, PNG, WebP 파일만 첨부할 수 있습니다.');
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

  const hasContent = Boolean(editorValue.plainText || editorValue.pendingImages.length);

  return (
    <PageScaffold
      breadcrumbs={[{ label: '자유게시판', to: '/boards/free' }, { label: '글쓰기' }]}
      title="새 글 작성"
      description="제목과 내용을 입력한 뒤 공개 범위를 확인해 주세요."
      width="reading"
      variant="form"
    >
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
          <RichTextEditor id="board-post-content" onChange={setEditorValue} />
        </div>

        <section className="editor-attachments" aria-labelledby="attachment-title">
          <div className="editor-attachments__heading">
            <div>
              <h2 id="attachment-title">첨부 파일</h2>
              <p>PDF 또는 이미지, 파일당 최대 10MB</p>
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
              accept="application/pdf,image/jpeg,image/png,image/webp"
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

        <section className="editor-privacy" aria-labelledby="privacy-title">
          <div>
            <h2 id="privacy-title">작성자 표시</h2>
            <p>선택하면 게시글 목록과 본문에서 이름을 표시하지 않습니다.</p>
          </div>
          <label className="editor-check">
            <input
              checked={isAnonymous}
              onChange={(event) => setIsAnonymous(event.target.checked)}
              type="checkbox"
            />
            <span>익명으로 작성</span>
          </label>
        </section>

        {mutation.isError ? (
          <PageState
            kind="error"
            title="게시글을 등록하지 못했습니다."
            description={mutationErrorMessage(mutation.error)}
          />
        ) : null}

        <div className="editor-actions">
          <Link className="detail-secondary-button" to="/boards/free">
            <ArrowLeft size={16} /> 취소
          </Link>
          <button
            className="detail-primary-button"
            disabled={mutation.isPending || !title.trim() || !hasContent}
            type="submit"
          >
            <Send size={16} /> {mutation.isPending ? '업로드 및 등록 중…' : '등록하기'}
          </button>
        </div>
      </form>
    </PageScaffold>
  );
}
