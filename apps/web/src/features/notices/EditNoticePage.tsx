import type { ChangeEvent, FormEvent } from 'react';
import { useRef, useState } from 'react';
import type { NoticeDetail } from '@jshsus/types';
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
import { getNotice, updateNotice } from './api';
import { parseRichNoticeContent, serializeRichNoticeContent } from './richNoticeContent';

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const MAX_ATTACHMENTS = 5;

function NoticeEditForm({ notice }: { notice: NoticeDetail }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const richContent = parseRichNoticeContent(notice.content);
  const initialDocument =
    richContent.contentDoc ?? plainTextToRichTextDocument(richContent.plainText);
  const [title, setTitle] = useState(notice.title);
  const [department, setDepartment] = useState(notice.department);
  const [pinned, setPinned] = useState(notice.pinned);
  const [editorValue, setEditorValue] = useState<RichTextEditorValue>({
    contentDoc: initialDocument,
    pendingImages: [],
    plainText: richContent.plainText,
  });
  const [attachments, setAttachments] = useState<File[]>([]);
  const [attachmentError, setAttachmentError] = useState('');

  const mutation = useMutation({
    mutationFn: async () => {
      const uploadedImageUrls = new Map<string, string>();
      for (const pendingImage of editorValue.pendingImages) {
        const uploaded = await uploadFile({
          file: pendingImage.file,
          targetType: 'notice',
          targetId: notice.id,
          visibility: 'public',
        });
        uploadedImageUrls.set(pendingImage.id, `/api/files/${uploaded.file.id}/content`);
      }

      for (const file of attachments) {
        await uploadFile({
          file,
          targetType: 'notice',
          targetId: notice.id,
          visibility: 'public',
        });
      }

      const contentDoc = uploadedImageUrls.size
        ? resolvePendingImages(editorValue.contentDoc, uploadedImageUrls)
        : stripPendingImages(editorValue.contentDoc);
      if (hasTemporaryImageSources(contentDoc)) {
        throw new Error('inline image document contains a temporary URL');
      }

      return updateNotice(notice.id, {
        title: title.trim(),
        department: department.trim(),
        pinned,
        content: serializeRichNoticeContent(contentDoc, editorValue.plainText),
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['notice', notice.id] }),
        queryClient.invalidateQueries({ queryKey: ['notices'] }),
        queryClient.invalidateQueries({ queryKey: ['home-dashboard'] }),
      ]);
      await navigate({ to: '/notices/$noticeId', params: { noticeId: String(notice.id) } });
      showToast({ title: '공지를 수정했습니다.', tone: 'success' });
    },
    onError: () =>
      showToast({
        title: '공지를 수정하지 못했습니다.',
        description: '입력 내용과 네트워크 상태를 확인한 뒤 다시 시도해 주세요.',
        tone: 'danger',
      }),
  });

  const addAttachments = (event: ChangeEvent<HTMLInputElement>) => {
    setAttachmentError('');
    const files = [...(event.target.files ?? [])];
    event.target.value = '';
    if (!files.length) return;

    const accepted: File[] = [];
    for (const file of files) {
      if (!ALLOWED_ATTACHMENT_TYPES.has(file.type)) {
        setAttachmentError(`${ATTACHMENT_FORMAT_DESCRIPTION} 파일만 첨부할 수 있습니다.`);
        continue;
      }
      if (file.size > MAX_ATTACHMENT_BYTES) {
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
    if (attachments.length + accepted.length > MAX_ATTACHMENTS) {
      setAttachmentError(`첨부 파일은 최대 ${MAX_ATTACHMENTS}개까지 등록할 수 있습니다.`);
      setAttachments((current) => [...current, ...accepted].slice(0, MAX_ATTACHMENTS));
      return;
    }
    setAttachments((current) => [...current, ...accepted]);
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!mutation.isPending) mutation.mutate();
  };

  return (
    <form className="editor-surface notice-editor-surface" onSubmit={submit}>
      <div className="editor-field">
        <label htmlFor="notice-title">제목</label>
        <input
          id="notice-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={255}
          autoFocus
          required
        />
      </div>
      <div className="editor-field notice-editor-author">
        <label htmlFor="notice-department">작성자</label>
        <input
          id="notice-department"
          value={department}
          onChange={(event) => setDepartment(event.target.value)}
          maxLength={80}
          required
        />
      </div>
      <div className="editor-field">
        <label htmlFor="notice-content">내용</label>
        <RichTextEditor
          id="notice-content"
          initialValue={initialDocument}
          onChange={setEditorValue}
        />
      </div>

      <section className="editor-attachments" aria-labelledby="notice-attachments-title">
        <div className="editor-attachments__heading">
          <div>
            <h2 id="notice-attachments-title">첨부 파일</h2>
            <p>{ATTACHMENT_FORMAT_DESCRIPTION} · 기존 첨부 파일은 유지됩니다.</p>
          </div>
          <button
            className="editor-file-button"
            type="button"
            onClick={() => attachmentInputRef.current?.click()}
          >
            <Paperclip size={16} aria-hidden="true" /> 파일 선택
          </button>
          <input
            ref={attachmentInputRef}
            className="sr-only"
            type="file"
            multiple
            accept={ATTACHMENT_INPUT_ACCEPT}
            onChange={addAttachments}
            tabIndex={-1}
          />
        </div>
        {attachments.length ? (
          <ul className="editor-attachment-list">
            {attachments.map((file, index) => (
              <li key={`${file.name}-${file.lastModified}`}>
                <FileText size={16} aria-hidden="true" />
                <span>{file.name}</span>
                <small>{(file.size / 1024 / 1024).toFixed(1)}MB</small>
                <button
                  type="button"
                  aria-label={`${file.name} 삭제`}
                  onClick={() =>
                    setAttachments((current) =>
                      current.filter((_, itemIndex) => itemIndex !== index),
                    )
                  }
                >
                  <Trash2 size={15} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {attachmentError ? <p className="editor-option-error">{attachmentError}</p> : null}
      </section>

      <label className="notice-editor-pin">
        <input
          type="checkbox"
          checked={pinned}
          onChange={(event) => setPinned(event.target.checked)}
        />
        <span>
          <strong>공지 목록 상단에 고정</strong>
        </span>
      </label>

      <div className="editor-actions">
        <Link
          className="detail-secondary-button"
          to="/notices/$noticeId"
          params={{ noticeId: String(notice.id) }}
        >
          <ArrowLeft size={16} aria-hidden="true" /> 취소
        </Link>
        <button
          className="detail-primary-button"
          type="submit"
          disabled={
            mutation.isPending ||
            !title.trim() ||
            !department.trim() ||
            (!editorValue.plainText && !editorValue.pendingImages.length)
          }
        >
          <Save size={16} aria-hidden="true" />
          {mutation.isPending ? '저장 중' : '저장'}
        </button>
      </div>
    </form>
  );
}

export function EditNoticePage() {
  const { noticeId } = useParams({ from: '/notices/$noticeId/edit' });
  const numericId = Number(noticeId);
  const noticeQuery = useQuery({
    queryKey: ['notice', numericId],
    queryFn: () => getNotice(numericId),
    enabled: Number.isInteger(numericId) && numericId > 0,
  });

  if (noticeQuery.isLoading) {
    return <PageState kind="loading" title="공지를 불러오는 중입니다." />;
  }

  if (noticeQuery.isError || !noticeQuery.data) {
    const status = noticeQuery.error instanceof ApiError ? noticeQuery.error.status : undefined;
    return (
      <PageScaffold
        breadcrumbs={detailBreadcrumbs('notices')}
        title={status === 404 ? '공지를 찾을 수 없습니다' : '공지를 불러오지 못했습니다'}
        width="reading"
        variant="document"
      >
        <PageState
          kind="error"
          variant="page"
          title={
            status === 404 ? '요청한 공지가 존재하지 않습니다.' : '잠시 후 다시 시도해 주세요.'
          }
          action={
            <Link className="detail-secondary-button" to="/notices">
              공지 목록으로
            </Link>
          }
        />
      </PageScaffold>
    );
  }

  return (
    <PageScaffold
      breadcrumbs={taskBreadcrumbs('notices', '수정')}
      title="공지 수정"
      description="공지 내용을 수정하세요."
      width="reading"
      variant="form"
    >
      <NoticeEditForm notice={noticeQuery.data} />
    </PageScaffold>
  );
}
