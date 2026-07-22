import type { ChangeEvent, FormEvent } from 'react';
import { useEffect, useId, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, ImagePlus, Send, Trash2 } from 'lucide-react';
import { PageScaffold, PageState } from '../../components/page/PageScaffold';
import { taskBreadcrumbs } from '../../components/page/pageHierarchy';
import { uploadFile } from '../../shared/api/files';
import { createLostItem, discardLostItem } from './api';
import '../../styles/lost-items.css';

const supportedImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const maxImageSize = 10 * 1024 * 1024;

export function NewLostItemPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const radioName = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>();
  const [fileError, setFileError] = useState<string>();
  const [form, setForm] = useState({
    type: 'lost' as 'lost' | 'found',
    itemName: '',
    location: '',
    occurredAt: '',
    description: '',
  });

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const mutation = useMutation({
    mutationFn: async () => {
      let createdId: number | undefined;
      try {
        const result = await createLostItem({
          ...form,
          occurredAt: form.occurredAt ? new Date(form.occurredAt).toISOString() : undefined,
        });
        createdId = result.lostItem.id;
        if (file) {
          await uploadFile({
            file,
            targetType: 'lost_item',
            targetId: result.lostItem.id,
            visibility: 'public',
          });
        }
        return result;
      } catch (error) {
        if (createdId) await discardLostItem(createdId).catch(() => undefined);
        throw error;
      }
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['lost-items'] });
      await navigate({ to: '/lost-items/$itemId', params: { itemId: String(result.lostItem.id) } });
    },
  });

  const selectImage = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0] ?? null;
    setFileError(undefined);
    if (!nextFile) return;
    if (!supportedImageTypes.has(nextFile.type)) {
      setFileError('JPG, PNG 또는 WebP 이미지만 등록할 수 있습니다.');
      event.target.value = '';
      return;
    }
    if (nextFile.size > maxImageSize) {
      setFileError('이미지는 10MB 이하만 등록할 수 있습니다.');
      event.target.value = '';
      return;
    }
    setFile(nextFile);
    setPreviewUrl(URL.createObjectURL(nextFile));
  };

  const removeImage = () => {
    setFile(null);
    setPreviewUrl(undefined);
    setFileError(undefined);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    mutation.mutate();
  };

  return (
    <PageScaffold
      breadcrumbs={taskBreadcrumbs('lostItems', '등록')}
      title="분실물 등록"
      width="reading"
      variant="form"
    >
      <form className="lost-item-form" onSubmit={submit}>
        <fieldset className="lost-item-form__type">
          <legend>어떤 물건인가요?</legend>
          <div>
            <label>
              <input
                type="radio"
                name={radioName}
                value="lost"
                checked={form.type === 'lost'}
                onChange={() => setForm((current) => ({ ...current, type: 'lost' }))}
              />
              <span>
                <strong>잃어버렸어요</strong>
                <small>찾고 있는 물건을 등록합니다.</small>
              </span>
            </label>
            <label>
              <input
                type="radio"
                name={radioName}
                value="found"
                checked={form.type === 'found'}
                onChange={() => setForm((current) => ({ ...current, type: 'found' }))}
              />
              <span>
                <strong>주웠어요</strong>
                <small>보관 중인 물건을 등록합니다.</small>
              </span>
            </label>
          </div>
        </fieldset>

        <div className="lost-item-form__section">
          <div className="lost-item-form__section-heading">
            <h2>물건 정보</h2>
            <p>공개 목록에 표시되는 정보입니다.</p>
          </div>
          <label className="lost-item-form__field">
            <span>물건 이름</span>
            <input
              value={form.itemName}
              onChange={(event) =>
                setForm((current) => ({ ...current, itemName: event.target.value }))
              }
              placeholder="예: 검은색 무선 이어폰 케이스"
              maxLength={100}
              required
              autoFocus
            />
          </label>
          <div className="lost-item-form__field-grid">
            <label className="lost-item-form__field">
              <span>분실·습득 장소</span>
              <input
                value={form.location}
                onChange={(event) =>
                  setForm((current) => ({ ...current, location: event.target.value }))
                }
                placeholder="예: 본관 2층 자습실"
                maxLength={150}
              />
            </label>
            <label className="lost-item-form__field">
              <span>분실·습득 일시</span>
              <input
                type="datetime-local"
                value={form.occurredAt}
                onChange={(event) =>
                  setForm((current) => ({ ...current, occurredAt: event.target.value }))
                }
              />
            </label>
          </div>
          <label className="lost-item-form__field">
            <span>특징과 보관 정보</span>
            <textarea
              value={form.description}
              onChange={(event) =>
                setForm((current) => ({ ...current, description: event.target.value }))
              }
              placeholder="색상, 크기, 눈에 띄는 특징과 현재 보관 장소를 적어 주세요."
              maxLength={2_000}
              rows={6}
            />
          </label>
        </div>

        <div className="lost-item-form__section">
          <div className="lost-item-form__section-heading">
            <h2>대표 사진</h2>
            <p>JPG, PNG, WebP 이미지 1장 · 최대 10MB</p>
          </div>
          <div className="lost-photo-input">
            {previewUrl ? (
              <div className="lost-photo-input__preview">
                <img src={previewUrl} alt="등록할 대표 사진 미리보기" />
              </div>
            ) : (
              <button
                className="lost-photo-input__empty"
                type="button"
                onClick={() => fileInputRef.current?.click()}
              >
                <ImagePlus size={24} aria-hidden="true" />
                <strong>사진 선택</strong>
                <span>물건 전체가 잘 보이는 사진을 올려 주세요.</span>
              </button>
            )}
            <div className="lost-photo-input__actions">
              <button
                className="detail-secondary-button"
                type="button"
                onClick={() => fileInputRef.current?.click()}
              >
                <ImagePlus size={15} aria-hidden="true" />
                {file ? '사진 교체' : '사진 선택'}
              </button>
              {file ? (
                <button type="button" className="lost-photo-input__remove" onClick={removeImage}>
                  <Trash2 size={15} aria-hidden="true" /> 삭제
                </button>
              ) : null}
              <input
                ref={fileInputRef}
                id="lost-item-image"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={selectImage}
                tabIndex={-1}
              />
            </div>
          </div>
          {fileError ? (
            <p className="lost-item-form__error" role="alert">
              {fileError}
            </p>
          ) : null}
        </div>

        {mutation.isError ? (
          <PageState kind="error" title="분실물 정보를 등록하지 못했습니다." variant="inline" />
        ) : null}

        <div className="lost-item-form__actions">
          <Link className="detail-secondary-button" to="/lost-items">
            <ArrowLeft size={16} aria-hidden="true" /> 취소
          </Link>
          <button className="detail-primary-button" type="submit" disabled={mutation.isPending}>
            <Send size={16} aria-hidden="true" />
            {mutation.isPending ? '등록 중' : '등록하기'}
          </button>
        </div>
      </form>
    </PageScaffold>
  );
}
