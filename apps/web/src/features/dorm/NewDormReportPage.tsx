import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { ArrowLeft, FileText, Paperclip, Trash2 } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import {
  plainTextToRichTextDocument,
  RichTextEditor,
  type RichTextEditorValue,
} from '../../components/editor/RichTextEditor';
import { PageScaffold, PageState } from '../../components/page/PageScaffold';
import { taskBreadcrumbs } from '../../components/page/pageHierarchy';
import { uploadFile } from '../../shared/api/files';
import { ATTACHMENT_INPUT_ACCEPT, isAllowedAttachmentFile } from '../../shared/lib/attachments';
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
  const [attachments, setAttachments] = useState<File[]>([]);
  const [attachmentError, setAttachmentError] = useState('');
  const attachmentInputRef = useRef<HTMLInputElement>(null);

  const reportText = [title.trim(), editorValue.plainText.trim()].filter(Boolean).join('\n\n');
  const hasContent = Boolean(title.trim() && editorValue.plainText.trim());
  const isTooLong = reportText.length > 500;
  const currentAssignment = dormQuery.data?.currentAssignment;

  const reportMutation = useMutation({
    mutationFn: async () => {
      const created = await createDormReport(reportText);
      for (const file of attachments) {
        await uploadFile({
          file,
          targetType: 'dorm_report',
          targetId: created.id,
          visibility: 'private',
        });
      }
      return created;
    },
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

  const addAttachments = (files: FileList | null) => {
    if (!files) return;
    const nextFiles: File[] = [];
    for (const file of Array.from(files)) {
      if (!isAllowedAttachmentFile(file)) {
        setAttachmentError(`${file.name} 파일 형식을 지원하지 않습니다.`);
        continue;
      }
      if (file.size > 10 * 1024 * 1024) {
        setAttachmentError(`${file.name} 파일은 10MB 이하만 첨부할 수 있습니다.`);
        continue;
      }
      nextFiles.push(file);
    }
    if (nextFiles.length > 0) {
      setAttachments((current) => [...current, ...nextFiles]);
      setAttachmentError('');
    }
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

          <section className="editor-attachments" aria-label="첨부 파일">
            <div className="editor-attachments__heading">
              <button
                className="editor-file-button"
                type="button"
                onClick={() => attachmentInputRef.current?.click()}
              >
                <Paperclip size={16} aria-hidden="true" />
                <span>파일 첨부</span>
              </button>
              <input
                ref={attachmentInputRef}
                accept={ATTACHMENT_INPUT_ACCEPT}
                className="editor-file-input"
                multiple
                onChange={(event) => {
                  addAttachments(event.target.files);
                  event.target.value = '';
                }}
                type="file"
              />
            </div>
            {attachments.length > 0 ? (
              <ul className="editor-attachments__list">
                {attachments.map((file, index) => (
                  <li key={`${file.name}-${file.lastModified}-${index}`}>
                    <FileText size={16} aria-hidden="true" />
                    <span>{file.name}</span>
                    <button
                      aria-label={`${file.name} 첨부 취소`}
                      type="button"
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
            {attachmentError ? (
              <p className="dorm-report-form__error" role="alert">
                {attachmentError}
              </p>
            ) : null}
          </section>

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
              <ArrowLeft size={16} aria-hidden="true" />
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
