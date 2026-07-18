import type { ChangeEvent, FormEvent } from 'react';
import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import { useToast } from '../../components/feedback/Toast';
import { PageScaffold } from '../../components/page/PageScaffold';
import { taskBreadcrumbs } from '../../components/page/pageHierarchy';
import { uploadFile } from '../../shared/api/files';
import {
  ALLOWED_ATTACHMENT_TYPES,
  ATTACHMENT_FORMAT_DESCRIPTION,
  ATTACHMENT_INPUT_ACCEPT,
} from '../../shared/lib/attachments';
import { getSession } from '../auth/api';
import { createNotice, deleteNotice, updateNotice } from './api';
import { serializeRichNoticeContent } from './richNoticeContent';

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const MAX_ATTACHMENTS = 5;
const emptyEditorValue: RichTextEditorValue = {
  contentDoc: plainTextToRichTextDocument(''),
  pendingImages: [],
  plainText: '',
};

export function NewNoticePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const sessionQuery = useQuery({ queryKey: ['session'], queryFn: getSession });
  const [title, setTitle] = useState('');
  const [departmentInput, setDepartment] = useState<string | undefined>(undefined);
  const [editorValue, setEditorValue] = useState<RichTextEditorValue>(emptyEditorValue);
  const [pinned, setPinned] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [attachmentError, setAttachmentError] = useState('');

  const department =
    departmentInput ??
    (sessionQuery.data?.isLogined && sessionQuery.data.name ? sessionQuery.data.name : '');

  const mutation = useMutation({
    mutationFn: async () => {
      let noticeId: number | null = null;
      try {
        const initialContentDoc = stripPendingImages(editorValue.contentDoc);
        const result = await createNotice({
          title: title.trim(),
          department: department.trim(),
          content: serializeRichNoticeContent(initialContentDoc, editorValue.plainText),
          pinned,
        });
        noticeId = result.notice.id;

        const uploadedImageUrls = new Map<string, string>();
        for (const pendingImage of editorValue.pendingImages) {
          const uploaded = await uploadFile({
            file: pendingImage.file,
            targetType: 'notice',
            targetId: noticeId,
            visibility: 'public',
          });
          uploadedImageUrls.set(pendingImage.id, `/api/files/${uploaded.file.id}/content`);
        }

        for (const file of attachments) {
          await uploadFile({
            file,
            targetType: 'notice',
            targetId: noticeId,
            visibility: 'public',
          });
        }

        if (uploadedImageUrls.size) {
          const contentDoc = resolvePendingImages(editorValue.contentDoc, uploadedImageUrls);
          if (hasTemporaryImageSources(contentDoc)) {
            throw new Error('inline image document contains a temporary URL');
          }
          await updateNotice(noticeId, {
            content: serializeRichNoticeContent(contentDoc, editorValue.plainText),
          });
        }
        return result;
      } catch (error) {
        if (noticeId) await deleteNotice(noticeId).catch(() => undefined);
        throw error;
      }
    },
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['notices'] }),
        queryClient.invalidateQueries({ queryKey: ['home-dashboard'] }),
      ]);
      await navigate({
        to: '/notices/$noticeId',
        params: { noticeId: String(result.notice.id) },
      });
      showToast({ title: '공지를 게시했습니다.', tone: 'success' });
    },
    onError: () =>
      showToast({
        title: '공지를 게시하지 못했습니다.',
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
    <PageScaffold
      breadcrumbs={taskBreadcrumbs('notices', '작성')}
      title="공지 작성"
      description="공지 내용을 입력하세요."
      width="reading"
      variant="form"
    >
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
            placeholder="예: 학생생활부, 방송부"
            required
          />
        </div>
        <div className="editor-field">
          <label htmlFor="notice-content">내용</label>
          <RichTextEditor id="notice-content" onChange={setEditorValue} />
        </div>

        <section className="editor-attachments" aria-labelledby="notice-attachments-title">
          <div className="editor-attachments__heading">
            <div>
              <h2 id="notice-attachments-title">첨부 파일</h2>
              <p>{ATTACHMENT_FORMAT_DESCRIPTION} · 파일당 최대 10MB · 최대 5개</p>
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
          <Link className="detail-secondary-button" to="/notices">
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
            <Send size={16} aria-hidden="true" />
            {mutation.isPending ? '게시 중' : '게시'}
          </button>
        </div>
      </form>
    </PageScaffold>
  );
}
