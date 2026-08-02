import type { FormEvent, PointerEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import {
  BedDouble,
  CalendarDays,
  Clock3,
  KeyRound,
  Mail,
  MapPin,
  Phone,
  Smartphone,
  SquareArrowOutUpRight,
  X,
} from 'lucide-react';
import { useToast } from '../../components/feedback/Toast';
import { PageState } from '../../components/page/PageScaffold';
import { ApiError } from '../../shared/api/http';
import { createKoreanDateFormatter } from '../../shared/lib/date';
import {
  deleteProfileImage,
  getMyStatus,
  updateMyContact,
  updateMyProfile,
  uploadProfileImage,
} from './api';
import '../../styles/my-status.css';

const dateFormatter = createKoreanDateFormatter({ month: 'long', day: 'numeric' });
const PROFILE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const PROFILE_CROP_FRAME_SIZE = 320;
const PROFILE_CROP_OUTPUT_SIZE = 512;

type CropDraft = {
  file: File;
  naturalHeight?: number;
  naturalWidth?: number;
  offsetX: number;
  offsetY: number;
  previewUrl: string;
  zoom: number;
};

type CropDragState = {
  originX: number;
  originY: number;
  pointerId: number;
  startX: number;
  startY: number;
};

type ContactField = 'email' | 'phone';

type ContactDraft = {
  field: ContactField;
  value: string;
};

const activitySlotLabels: Record<string, string> = {
  'morning-1': '오전 1면학',
  'morning-2': '오전 2면학',
  'afternoon-1': '오후 1면학',
  'afternoon-2': '오후 2면학',
  'evening-1': '저녁 1면학',
  'evening-2': '저녁 2면학',
  'evening-3': '저녁 3면학',
};

function signedPoint(value: number) {
  return value > 0 ? `+${value}` : String(value);
}

export function maskEmail(value?: string) {
  if (!value || !value.includes('@')) return '미등록';
  const [local, domain] = value.split('@');
  const domainParts = domain.split('.');
  const visibleLocal = local.slice(0, Math.min(2, local.length));
  const visibleDomain = domainParts[0]?.slice(0, 1) ?? '';
  const suffix = domainParts.length > 1 ? `.${domainParts.slice(1).join('.')}` : '';
  return `${visibleLocal}******@${visibleDomain}******${suffix}`;
}

export function maskPhone(value?: string) {
  const digits = value?.replace(/\D/g, '') ?? '';
  if (digits.length < 8) return '미등록';
  const prefix = digits.slice(0, 3);
  const middle = digits.slice(3, -4);
  const end = digits.slice(-4);
  return `${prefix}-${middle.slice(0, 1)}***-${end.slice(0, 1)}***`;
}

function activityTimeLabel(slotIds?: string[], startsAt?: string, endsAt?: string) {
  const labels = slotIds?.map((id) => activitySlotLabels[id]).filter(Boolean) ?? [];
  if (labels.length) return labels.join(', ');
  if (!startsAt || !endsAt) return '시간 미정';
  const format = (value: string) =>
    new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false }).format(
      new Date(value),
    );
  return `${format(startsAt)}~${format(endsAt)}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getCropGeometry(crop: CropDraft) {
  const naturalWidth = crop.naturalWidth && crop.naturalWidth > 0 ? crop.naturalWidth : 1;
  const naturalHeight = crop.naturalHeight && crop.naturalHeight > 0 ? crop.naturalHeight : 1;
  const baseScale = Math.max(
    PROFILE_CROP_FRAME_SIZE / naturalWidth,
    PROFILE_CROP_FRAME_SIZE / naturalHeight,
  );
  const scale = baseScale * crop.zoom;
  const displayWidth = naturalWidth * scale;
  const displayHeight = naturalHeight * scale;
  const maxOffsetX = Math.max(0, (displayWidth - PROFILE_CROP_FRAME_SIZE) / 2);
  const maxOffsetY = Math.max(0, (displayHeight - PROFILE_CROP_FRAME_SIZE) / 2);
  const offsetX = clamp(crop.offsetX, -maxOffsetX, maxOffsetX);
  const offsetY = clamp(crop.offsetY, -maxOffsetY, maxOffsetY);

  return {
    displayHeight,
    displayWidth,
    left: (PROFILE_CROP_FRAME_SIZE - displayWidth) / 2 + offsetX,
    maxOffsetX,
    maxOffsetY,
    offsetX,
    offsetY,
    scale,
    top: (PROFILE_CROP_FRAME_SIZE - displayHeight) / 2 + offsetY,
  };
}

function clampCropDraft(crop: CropDraft): CropDraft {
  const geometry = getCropGeometry(crop);
  return { ...crop, offsetX: geometry.offsetX, offsetY: geometry.offsetY };
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('이미지를 불러오지 못했습니다.'));
    image.src = src;
  });
}

async function createCroppedProfileImage(crop: CropDraft) {
  const image = await loadImage(crop.previewUrl);
  const geometry = getCropGeometry({
    ...crop,
    naturalHeight: image.naturalHeight,
    naturalWidth: image.naturalWidth,
  });
  const canvas = document.createElement('canvas');
  canvas.width = PROFILE_CROP_OUTPUT_SIZE;
  canvas.height = PROFILE_CROP_OUTPUT_SIZE;

  const context = canvas.getContext('2d');
  if (!context) throw new Error('이미지 편집을 시작하지 못했습니다.');

  const ratio = PROFILE_CROP_OUTPUT_SIZE / PROFILE_CROP_FRAME_SIZE;
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(
    image,
    geometry.left * ratio,
    geometry.top * ratio,
    geometry.displayWidth * ratio,
    geometry.displayHeight * ratio,
  );

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => {
        if (result) resolve(result);
        else reject(new Error('이미지를 저장하지 못했습니다.'));
      },
      'image/jpeg',
      0.92,
    );
  });
  const baseName = crop.file.name.replace(/\.[^.]+$/, '') || 'profile';
  return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' });
}

export function MyStatusPage() {
  const statusQuery = useQuery({ queryKey: ['my-status'], queryFn: getMyStatus });
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const profileImageInputRef = useRef<HTMLInputElement>(null);
  const cropDraftRef = useRef<CropDraft | null>(null);
  const cropDragRef = useRef<CropDragState | null>(null);
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const [cropDraft, setCropDraft] = useState<CropDraft | null>(null);
  const [nicknameDraft, setNicknameDraft] = useState<string | null>(null);
  const [contactDraft, setContactDraft] = useState<ContactDraft | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const nickname = nicknameDraft ?? statusQuery.data?.student.nickname ?? '';

  useEffect(() => {
    cropDraftRef.current = cropDraft;
  }, [cropDraft]);

  useEffect(
    () => () => {
      if (cropDraftRef.current) URL.revokeObjectURL(cropDraftRef.current.previewUrl);
    },
    [],
  );

  const profileMutation = useMutation({
    mutationFn: () => updateMyProfile(nickname),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['my-status'] });
      showToast({ title: '닉네임을 저장했습니다.', tone: 'success' });
      setNicknameDraft(null);
    },
    onError: () =>
      showToast({
        title: '닉네임을 저장하지 못했습니다.',
        description: '입력한 닉네임을 확인해 주세요.',
        tone: 'danger',
      }),
  });

  const contactMutation = useMutation({
    mutationFn: (draft: ContactDraft) => updateMyContact(draft.field, draft.value),
    onSuccess: async (_, draft) => {
      await queryClient.invalidateQueries({ queryKey: ['my-status'] });
      setContactDraft(null);
      showToast({
        title: `${draft.field === 'email' ? '이메일' : '휴대폰번호'}를 변경했습니다.`,
        tone: 'success',
      });
    },
    onError: () => showToast({ title: '연락처를 변경하지 못했습니다.', tone: 'danger' }),
  });

  const imageMutation = useMutation({
    mutationFn: uploadProfileImage,
    onSuccess: async () => {
      setProfileError(null);
      await queryClient.invalidateQueries({ queryKey: ['my-status'] });
      showToast({ title: '프로필 사진을 변경했습니다.', tone: 'success' });
    },
    onError: () => showToast({ title: '프로필 사진을 변경하지 못했습니다.', tone: 'danger' }),
  });

  const imageDeleteMutation = useMutation({
    mutationFn: deleteProfileImage,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['my-status'] });
      showToast({ title: '프로필 사진을 삭제했습니다.', tone: 'success' });
    },
    onError: () => showToast({ title: '프로필 사진을 삭제하지 못했습니다.', tone: 'danger' }),
  });

  const submitProfile = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!profileMutation.isPending) profileMutation.mutate();
  };

  const closeProfileCrop = () => {
    setCropDraft((current) => {
      if (current) URL.revokeObjectURL(current.previewUrl);
      return null;
    });
    cropDragRef.current = null;
  };

  const updateCropDraft = (updater: (current: CropDraft) => CropDraft) => {
    setCropDraft((current) => (current ? clampCropDraft(updater(current)) : current));
  };

  const selectProfileImage = (file?: File) => {
    setProfileError(null);
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setProfileError('JPG, PNG, WebP 이미지만 사용할 수 있습니다.');
      return;
    }
    if (file.size > PROFILE_IMAGE_MAX_BYTES) {
      setProfileError('프로필 사진은 5MB 이하여야 합니다.');
      return;
    }
    const previewUrl = URL.createObjectURL(file);
    setCropDraft((current) => {
      if (current) URL.revokeObjectURL(current.previewUrl);
      return { file, offsetX: 0, offsetY: 0, previewUrl, zoom: 1 };
    });
  };

  const confirmProfileCrop = async () => {
    if (!cropDraft || imageMutation.isPending) return;

    try {
      const croppedFile = await createCroppedProfileImage(cropDraft);
      imageMutation.mutate(croppedFile, { onSuccess: closeProfileCrop });
    } catch {
      setProfileError('프로필 사진을 자르지 못했습니다. 다른 이미지를 선택해 주세요.');
    }
  };

  const startCropDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (!cropDraft || event.button !== 0) return;
    event.preventDefault();
    cropDragRef.current = {
      originX: cropDraft.offsetX,
      originY: cropDraft.offsetY,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveCropDrag = (event: PointerEvent<HTMLDivElement>) => {
    const drag = cropDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    updateCropDraft((current) => ({
      ...current,
      offsetX: drag.originX + event.clientX - drag.startX,
      offsetY: drag.originY + event.clientY - drag.startY,
    }));
  };

  const endCropDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (cropDragRef.current?.pointerId !== event.pointerId) return;
    cropDragRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // The browser may already have released capture after a cancelled pointer.
    }
  };

  if (statusQuery.isLoading) {
    return (
      <div className="my-page">
        <PageState kind="loading" title="마이페이지를 불러오는 중입니다." variant="page" />
      </div>
    );
  }

  if (statusQuery.isError || !statusQuery.data) {
    const error = statusQuery.error;
    const statusCode = error instanceof ApiError ? error.status : undefined;
    const isUnauthenticated = statusCode === 401;
    const isStudentUnlinked = statusCode === 400 || statusCode === 404;

    return (
      <div className="my-page">
        <PageState
          kind={isStudentUnlinked ? 'empty' : 'error'}
          title={
            isUnauthenticated
              ? '로그인이 필요합니다.'
              : isStudentUnlinked
                ? '학생 정보를 연결할 수 없습니다.'
                : '마이페이지를 불러오지 못했습니다.'
          }
          description={
            isUnauthenticated
              ? '로그인 후 상벌점과 생활 정보를 확인할 수 있습니다.'
              : isStudentUnlinked
                ? '통합로그인 계정에 학생 정보가 연결되어 있는지 학생생활부에 문의해 주세요.'
                : '일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.'
          }
          action={
            isUnauthenticated ? (
              <Link
                className="detail-primary-button"
                to="/login"
                search={{ returnTo: '/my-status' }}
              >
                로그인
              </Link>
            ) : !isStudentUnlinked ? (
              <button
                className="detail-secondary-button"
                type="button"
                onClick={() => statusQuery.refetch()}
              >
                다시 시도
              </button>
            ) : null
          }
          variant="page"
        />
      </div>
    );
  }

  const status = statusQuery.data;
  const cropGeometry = cropDraft ? getCropGeometry(cropDraft) : null;
  const deviceCases =
    status.deviceCases ??
    (status.deviceCase
      ? [
          {
            ...status.deviceCase,
            label: `${status.deviceCase.id}번`,
          },
        ]
      : []);
  const deviceCaseTitle = deviceCases.length
    ? deviceCases.map((deviceCase) => deviceCase.label).join(' · ')
    : '미연결';
  const deviceCaseStatus = deviceCases.length
    ? deviceCases
        .map((deviceCase) => `${deviceCase.label} ${deviceCase.isOpen ? '열림' : '잠김'}`)
        .join(' · ')
    : '연결 정보 없음';

  return (
    <div className="my-page">
      <h1 className="sr-only">마이페이지</h1>
      <section className="status-profile-card" aria-label="프로필 정보">
        <form className="status-profile-form" onSubmit={submitProfile}>
          <div className="status-identity">
            <div
              className="status-avatar"
              onBlur={(event) => {
                const nextTarget = event.relatedTarget;
                if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
                  setAvatarMenuOpen(false);
                }
              }}
            >
              <button
                aria-expanded={status.student.profileImageUrl ? avatarMenuOpen : undefined}
                aria-haspopup={status.student.profileImageUrl ? 'menu' : undefined}
                aria-label={
                  status.student.profileImageUrl ? '프로필 사진 메뉴 열기' : '프로필 사진 업로드'
                }
                className="status-avatar__trigger"
                disabled={imageMutation.isPending || imageDeleteMutation.isPending}
                onClick={() => {
                  if (status.student.profileImageUrl) {
                    setAvatarMenuOpen((current) => !current);
                    return;
                  }
                  profileImageInputRef.current?.click();
                }}
                type="button"
              >
                {status.student.profileImageUrl ? (
                  <img src={status.student.profileImageUrl} alt="현재 프로필" />
                ) : (
                  <img src="/assets/default-avatar.png" alt="기본 프로필" />
                )}
              </button>
              {avatarMenuOpen && status.student.profileImageUrl ? (
                <div className="status-avatar__menu" role="menu">
                  <button
                    role="menuitem"
                    onClick={() => {
                      setAvatarMenuOpen(false);
                      profileImageInputRef.current?.click();
                    }}
                    type="button"
                  >
                    사진 업로드
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => {
                      setAvatarMenuOpen(false);
                      imageDeleteMutation.mutate();
                    }}
                    type="button"
                  >
                    사진 삭제
                  </button>
                </div>
              ) : null}
              <input
                ref={profileImageInputRef}
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={(event) => {
                  selectProfileImage(event.target.files?.[0]);
                  event.target.value = '';
                }}
                tabIndex={-1}
                type="file"
              />
            </div>
            <div className="status-identity__copy">
              <div className="status-person-name">
                <strong>{status.student.name}</strong>
                <span>{status.student.studentNo}</span>
              </div>
              <div className="status-profile-inline-form">
                <label htmlFor="profile-nickname">닉네임</label>
                <input
                  id="profile-nickname"
                  maxLength={16}
                  onChange={(event) => setNicknameDraft(event.target.value)}
                  placeholder="닉네임"
                  type="text"
                  value={nickname}
                />
              </div>
              {profileError ? <small className="status-profile-error">{profileError}</small> : null}
            </div>
          </div>

          <div className="status-contact-list">
            <div className="status-contact-row">
              <Phone size={18} aria-hidden="true" />
              <span>{maskPhone(status.student.phone)}</span>
              <button
                type="button"
                onClick={() =>
                  setContactDraft({ field: 'phone', value: status.student.phone ?? '' })
                }
              >
                수정
              </button>
            </div>
            <div className="status-contact-row">
              <Mail size={18} aria-hidden="true" />
              <span>{maskEmail(status.student.email)}</span>
              <button
                type="button"
                onClick={() =>
                  setContactDraft({ field: 'email', value: status.student.email ?? '' })
                }
              >
                수정
              </button>
            </div>
            <div className="status-contact-row">
              <KeyRound size={18} aria-hidden="true" />
              <span>비밀번호</span>
              <Link to="/forgot-password" search={{ username: String(status.student.studentNo) }}>
                수정
              </Link>
            </div>
          </div>

          <button
            className="status-profile-save"
            disabled={profileMutation.isPending}
            type="submit"
          >
            {profileMutation.isPending ? '저장 중…' : '저장'}
          </button>
        </form>
      </section>

      <section className="status-overview" aria-labelledby="status-points-title">
        <header className="status-section-heading">
          <h2 id="status-points-title">상벌점</h2>
          <Link to="/points" aria-label="상벌점 자세히 보기" title="상벌점 자세히 보기">
            <SquareArrowOutUpRight size={17} aria-hidden="true" />
          </Link>
        </header>
        <div className="status-point-chips" aria-label="상벌점 요약">
          <span className="is-positive">
            상점 <strong>{Math.abs(status.points.meritPoint)}</strong>
          </span>
          <span className="is-negative">
            벌점 <strong>{Math.abs(status.points.penaltyPoint)}</strong>
          </span>
          <span className="is-total">
            합계 <strong>{signedPoint(status.points.currentPoint)}</strong>
          </span>
        </div>
        <div className="status-point-preview">
          {status.points.records.length ? (
            status.points.records.slice(0, 3).map((record) => (
              <div key={record.id}>
                <time>{record.baseDate.replaceAll('-', '. ')}</time>
                <strong className={record.point >= 0 ? 'is-positive' : 'is-negative'}>
                  {signedPoint(record.point)}
                </strong>
                <span>{record.comment || record.reason}</span>
              </div>
            ))
          ) : (
            <p>최근 상벌점 내역이 없습니다.</p>
          )}
        </div>
      </section>

      <section className="status-activity" aria-labelledby="status-activity-title">
        <header>
          <h2 id="status-activity-title">최근 탐구활동서</h2>
          <Link
            to="/activity-requests"
            aria-label="탐구활동서 자세히 보기"
            title="탐구활동서 자세히 보기"
          >
            <SquareArrowOutUpRight size={17} aria-hidden="true" />
          </Link>
        </header>
        {status.latestActivityRequest ? (
          <Link
            className="status-activity__row"
            to="/activity-requests/$requestId"
            params={{ requestId: String(status.latestActivityRequest.id) }}
          >
            <strong>{status.latestActivityRequest.purpose}</strong>
            <span className="status-activity__meta">
              <span>
                <CalendarDays size={14} aria-hidden="true" />
                {dateFormatter.format(new Date(status.latestActivityRequest.startsAt))}
              </span>
              <span>
                <Clock3 size={14} aria-hidden="true" />
                {activityTimeLabel(
                  status.latestActivityRequest.activitySlotIds,
                  status.latestActivityRequest.startsAt,
                  status.latestActivityRequest.endsAt,
                )}
              </span>
              <span>
                <MapPin size={14} aria-hidden="true" />
                {status.latestActivityRequest.location}
              </span>
            </span>
          </Link>
        ) : (
          <p className="status-activity__empty">최근 신청 내역이 없습니다.</p>
        )}
      </section>
      <section className="status-overview" aria-labelledby="status-life-title">
        <header className="status-section-heading">
          <h2 id="status-life-title">생활 정보</h2>
        </header>
        <div className="status-life" aria-label="생활 정보 요약">
          <article>
            <BedDouble size={20} aria-hidden="true" />
            <div>
              <span>기숙사</span>
              <strong>
                {status.dorm ? `${status.dorm.dormName} ${status.dorm.roomName}` : '미배정'}
              </strong>
              <small>{status.dorm ? `${status.dorm.bedPosition}번 침대` : '배정 정보 없음'}</small>
            </div>
          </article>
          <article>
            <Smartphone size={20} aria-hidden="true" />
            <div>
              <span>스마트폰 보관함</span>
              <strong>{deviceCaseTitle}</strong>
              <small>{deviceCaseStatus}</small>
            </div>
          </article>
        </div>
      </section>

      <p className="status-help">
        상벌점 기록이나 생활 정보가 실제와 다르면 학생생활부에 문의해 주세요.
      </p>

      {cropDraft && cropGeometry ? (
        <div className="status-crop-backdrop">
          <section
            className="status-crop-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="status-crop-title"
          >
            <header>
              <h2 id="status-crop-title">새 프로필 사진 자르기</h2>
              <button
                type="button"
                aria-label="닫기"
                onClick={closeProfileCrop}
                disabled={imageMutation.isPending}
              >
                <X size={18} aria-hidden="true" />
              </button>
            </header>
            <div className="status-cropper">
              <div
                className="status-crop-frame"
                onPointerCancel={endCropDrag}
                onPointerDown={startCropDrag}
                onPointerMove={moveCropDrag}
                onPointerUp={endCropDrag}
                style={{
                  height: PROFILE_CROP_FRAME_SIZE,
                  width: PROFILE_CROP_FRAME_SIZE,
                }}
              >
                <img
                  src={cropDraft.previewUrl}
                  alt=""
                  draggable={false}
                  onLoad={(event) =>
                    updateCropDraft((current) => ({
                      ...current,
                      naturalHeight: event.currentTarget.naturalHeight,
                      naturalWidth: event.currentTarget.naturalWidth,
                    }))
                  }
                  style={{
                    height: cropGeometry.displayHeight,
                    transform: `translate(${cropGeometry.left}px, ${cropGeometry.top}px)`,
                    width: cropGeometry.displayWidth,
                  }}
                />
                <span className="status-crop-frame__guide" aria-hidden="true" />
              </div>
            </div>
            <label className="status-crop-zoom">
              <span>확대</span>
              <input
                type="range"
                min="1"
                max="3"
                step="0.01"
                value={cropDraft.zoom}
                onChange={(event) =>
                  updateCropDraft((current) => ({ ...current, zoom: Number(event.target.value) }))
                }
              />
            </label>
            {profileError ? <p className="status-crop-error">{profileError}</p> : null}
            <div className="status-crop-actions">
              <button
                className="detail-secondary-button"
                type="button"
                onClick={closeProfileCrop}
                disabled={imageMutation.isPending}
              >
                취소
              </button>
              <button
                className="detail-primary-button"
                type="button"
                onClick={confirmProfileCrop}
                disabled={imageMutation.isPending}
              >
                {imageMutation.isPending ? '저장 중…' : '프로필 사진 저장'}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {contactDraft ? (
        <div className="status-crop-backdrop">
          <section
            className="status-contact-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="status-contact-title"
          >
            <header>
              <div>
                <h2 id="status-contact-title">
                  {contactDraft.field === 'email' ? '이메일 변경' : '휴대폰번호 변경'}
                </h2>
                <p>통합로그인과 연락처 정보에 함께 반영됩니다.</p>
              </div>
              <button type="button" aria-label="닫기" onClick={() => setContactDraft(null)}>
                <X size={18} aria-hidden="true" />
              </button>
            </header>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (!contactMutation.isPending) contactMutation.mutate(contactDraft);
              }}
            >
              <label htmlFor="status-contact-value">
                {contactDraft.field === 'email' ? '이메일' : '휴대폰번호'}
              </label>
              <input
                id="status-contact-value"
                autoFocus
                autoComplete={contactDraft.field === 'email' ? 'email' : 'tel'}
                inputMode={contactDraft.field === 'email' ? 'email' : 'tel'}
                type={contactDraft.field === 'email' ? 'email' : 'tel'}
                value={contactDraft.value}
                onChange={(event) =>
                  setContactDraft((current) =>
                    current ? { ...current, value: event.target.value } : current,
                  )
                }
                placeholder={contactDraft.field === 'email' ? 'name@example.com' : '010-0000-0000'}
                required
              />
              <div className="status-contact-modal__actions">
                <button type="button" onClick={() => setContactDraft(null)}>
                  취소
                </button>
                <button type="submit" disabled={contactMutation.isPending}>
                  {contactMutation.isPending ? '저장 중…' : '저장'}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  );
}
