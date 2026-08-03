import type { FormEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { ArrowLeft, FileText, Paperclip, Plus, Save, Send, Trash2 } from 'lucide-react';
import {
  hasTemporaryImageSources,
  plainTextToRichTextDocument,
  resolvePendingImages,
  RichTextEditor,
  stripPendingImages,
  type RichTextEditorValue,
} from '../../components/editor/RichTextEditor';
import { useToast } from '../../components/feedback/Toast';
import { PageScaffold } from '../../components/page/PageScaffold';
import { taskBreadcrumbs } from '../../components/page/pageHierarchy';
import { uploadFile } from '../../shared/api/files';
import {
  ALLOWED_ATTACHMENT_TYPES,
  ATTACHMENT_FORMAT_DESCRIPTION,
  ATTACHMENT_INPUT_ACCEPT,
} from '../../shared/lib/attachments';
import {
  createBoardPostDraft,
  deleteBoardPostDraft,
  getLatestBoardPostDraft,
  publishBoardPost,
  updateBoardPost,
} from './api';

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const emptyDocument = plainTextToRichTextDocument('');
const emptyEditorValue: RichTextEditorValue = {
  contentDoc: emptyDocument,
  pendingImages: [],
  plainText: '',
};

function draftSnapshot(title: string, value: RichTextEditorValue) {
  return JSON.stringify({
    title: title.trim(),
    content: value.plainText,
    contentDoc: stripPendingImages(value.contentDoc),
  });
}

function mutationErrorMessage(error: Error | null) {
  if (!error) return '로그인 상태와 입력 내용을 확인해 주세요.';
  if (error.message.includes('inline image')) {
    return '이미지 저장에 필요한 서버 기능을 확인해 주세요. 작성 중인 글은 공개되지 않았습니다.';
  }
  return '네트워크 상태를 확인한 뒤 다시 시도해 주세요. 작성 중인 글은 초안으로 보관됩니다.';
}

function formatDraftTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '이전에';
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

export function NewBoardPostPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const draftIdRef = useRef<number | null>(null);
  const saveInFlightRef = useRef<Promise<number | null> | null>(null);
  const [title, setTitle] = useState('');
  const [editorValue, setEditorValue] = useState<RichTextEditorValue>(emptyEditorValue);
  const [editorKey, setEditorKey] = useState(0);
  const [draftId, setDraftId] = useState<number | null>(null);
  const [lastSavedSnapshot, setLastSavedSnapshot] = useState(() =>
    draftSnapshot('', emptyEditorValue),
  );
  const [dismissedDraftId, setDismissedDraftId] = useState<number | null>(null);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [isSavingDraft, setIsSavingDraft] = useState(false);

  const latestDraftQuery = useQuery({
    queryKey: ['board-post-draft', 'free', 'latest'],
    queryFn: () => getLatestBoardPostDraft('free'),
    staleTime: 0,
  });

  const currentSnapshot = useMemo(() => draftSnapshot(title, editorValue), [editorValue, title]);
  const hasLocalFiles = editorValue.pendingImages.length > 0 || attachments.length > 0;
  const isDirty = currentSnapshot !== lastSavedSnapshot || hasLocalFiles;
  const latestDraft = latestDraftQuery.data?.draft ?? null;
  const resumeDraft = latestDraft?.id === dismissedDraftId ? null : latestDraft;

  useEffect(() => {
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [isDirty]);

  const persistDraft = useCallback(
    async (manual = false) => {
      if ((!title.trim() && !editorValue.plainText.trim()) || resumeDraft) return null;
      if (saveInFlightRef.current) return saveInFlightRef.current;

      const snapshot = currentSnapshot;
      const input = {
        slug: 'free',
        title: title.trim() || '제목 없는 초안',
        content: editorValue.plainText,
        contentDoc: stripPendingImages(editorValue.contentDoc),
        isAnonymous: false,
      };

      setIsSavingDraft(true);
      const operation = (async () => {
        const existingId = draftIdRef.current;
        const result = existingId
          ? await updateBoardPost({ ...input, postId: existingId })
          : await createBoardPostDraft(input);
        const nextId = result.post.id;
        draftIdRef.current = nextId;
        setDraftId(nextId);
        setLastSavedSnapshot(snapshot);
        if (manual) showToast({ title: '임시저장했습니다.', tone: 'info' });
        return nextId;
      })();

      saveInFlightRef.current = operation;
      try {
        return await operation;
      } finally {
        saveInFlightRef.current = null;
        setIsSavingDraft(false);
      }
    },
    [currentSnapshot, editorValue, resumeDraft, showToast, title],
  );

  useEffect(() => {
    if (!latestDraftQuery.isFetched || resumeDraft || !isDirty || hasLocalFiles) return;
    if (!title.trim() && !editorValue.plainText.trim()) return;
    const timer = window.setTimeout(() => void persistDraft(false), 1500);
    return () => window.clearTimeout(timer);
  }, [
    editorValue.plainText,
    hasLocalFiles,
    isDirty,
    latestDraftQuery.isFetched,
    persistDraft,
    resumeDraft,
    title,
  ]);

  const mutation = useMutation({
    mutationFn: async () => {
      const savedDraftId = await persistDraft(false);
      if (!savedDraftId) throw new Error('Draft could not be created.');
      const uploadedImageUrls = new Map<string, string>();

      for (const pendingImage of editorValue.pendingImages) {
        const result = await uploadFile({
          file: pendingImage.file,
          targetType: 'post',
          targetId: savedDraftId,
          visibility: 'private',
        });
        uploadedImageUrls.set(pendingImage.id, `/api/files/${result.file.id}/content`);
      }

      for (const file of attachments) {
        await uploadFile({
          file,
          targetType: 'post',
          targetId: savedDraftId,
          visibility: 'private',
        });
      }

      const contentDoc = resolvePendingImages(editorValue.contentDoc, uploadedImageUrls);
      if (hasTemporaryImageSources(contentDoc)) {
        throw new Error('inline image document contains a temporary URL');
      }

      await updateBoardPost({
        slug: 'free',
        postId: savedDraftId,
        title: title.trim(),
        content: editorValue.plainText,
        contentDoc,
        isAnonymous: false,
      });
      return publishBoardPost('free', savedDraftId);
    },
    onSuccess: async (result) => {
      setLastSavedSnapshot(currentSnapshot);
      setAttachments([]);
      await queryClient.invalidateQueries({ queryKey: ['board-posts', 'free'] });
      await queryClient.invalidateQueries({ queryKey: ['board-post-draft', 'free', 'latest'] });
      await navigate({ to: '/boards/free/$postId', params: { postId: String(result.post.id) } });
      showToast({ title: '게시글을 등록했습니다.', tone: 'success' });
    },
    onError: (error) =>
      showToast({
        title: '게시글을 등록하지 못했습니다.',
        description: mutationErrorMessage(error),
        tone: 'danger',
      }),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!mutation.isPending) mutation.mutate();
  };

  const leaveEditor = async () => {
    if (isDirty && !window.confirm('작성 중인 내용이 저장되지 않을 수 있습니다. 나가시겠습니까?')) {
      return;
    }
    await navigate({ to: '/boards/free' });
  };

  const resumeSavedDraft = () => {
    if (!resumeDraft) return;
    const resumedValue: RichTextEditorValue = {
      contentDoc: resumeDraft.contentDoc ?? plainTextToRichTextDocument(resumeDraft.content),
      pendingImages: [],
      plainText: resumeDraft.content,
    };
    setTitle(resumeDraft.title === '제목 없는 초안' ? '' : resumeDraft.title);
    setEditorValue(resumedValue);
    setEditorKey((current) => current + 1);
    draftIdRef.current = resumeDraft.id;
    setDraftId(resumeDraft.id);
    setLastSavedSnapshot(
      draftSnapshot(resumeDraft.title === '제목 없는 초안' ? '' : resumeDraft.title, resumedValue),
    );
    setDismissedDraftId(resumeDraft.id);
  };

  const discardSavedDraft = async () => {
    if (!resumeDraft) return;
    await deleteBoardPostDraft('free', resumeDraft.id).catch(() => undefined);
    setDismissedDraftId(resumeDraft.id);
    await queryClient.invalidateQueries({ queryKey: ['board-post-draft', 'free', 'latest'] });
  };

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

  const hasContent = Boolean(editorValue.plainText || editorValue.pendingImages.length);

  return (
    <PageScaffold
      breadcrumbs={taskBreadcrumbs('board', '글쓰기')}
      title="게시글 작성"
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
          <RichTextEditor
            key={editorKey}
            id="board-post-content"
            allowPoll
            initialValue={editorValue.contentDoc}
            onChange={setEditorValue}
          />
        </div>

        <section className="editor-attachments" aria-labelledby="attachment-title">
          <div className="editor-attachments__heading">
            <div>
              <h2 id="attachment-title">첨부 파일</h2>
              <p>{ATTACHMENT_FORMAT_DESCRIPTION} · 파일당 최대 10MB</p>
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

        <div className="editor-actions editor-actions--drafts">
          <button className="detail-secondary-button" onClick={leaveEditor} type="button">
            <ArrowLeft size={16} /> 취소
          </button>
          <div className="editor-actions__publish">
            <button
              className="detail-secondary-button"
              disabled={isSavingDraft || (!title.trim() && !editorValue.plainText.trim())}
              onClick={() => void persistDraft(true)}
              type="button"
            >
              {isSavingDraft ? <Save size={16} /> : <Plus size={16} />}
              {isSavingDraft ? '저장 중' : '임시저장'}
            </button>
            <button
              className="detail-primary-button"
              disabled={mutation.isPending || !title.trim() || !hasContent}
              type="submit"
            >
              <Send size={16} /> {mutation.isPending ? '게시 중' : '게시'}
            </button>
          </div>
        </div>
        {draftId && !isDirty && !mutation.isPending ? (
          <p className="editor-draft-state" role="status">
            서버에 임시저장됨
          </p>
        ) : null}
      </form>

      {resumeDraft ? (
        <div className="editor-resume-modal" role="presentation">
          <section
            aria-describedby="resume-draft-description"
            aria-labelledby="resume-draft-title"
            aria-modal="true"
            className="editor-resume-modal__dialog"
            role="dialog"
          >
            <h2 id="resume-draft-title">작성 중인 글이 있습니다.</h2>
            <p id="resume-draft-description">
              {formatDraftTime(resumeDraft.updatedAt)}에 저장한 내용을 이어서 작성하시겠습니까?
            </p>
            <div>
              <button className="detail-secondary-button" onClick={discardSavedDraft} type="button">
                취소
              </button>
              <button className="detail-primary-button" onClick={resumeSavedDraft} type="button">
                확인
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </PageScaffold>
  );
}
