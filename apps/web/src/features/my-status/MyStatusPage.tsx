import type { PointerEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { formatDormBedPosition } from '@jshsus/types';
import {
  BedDouble,
  CalendarDays,
  ChevronRight,
  Clock3,
  KeyRound,
  Mail,
  MapPin,
  Phone,
  Smartphone,
  UserRound,
  X,
} from 'lucide-react';
import { useToast } from '../../components/feedback/Toast';
import { PageState } from '../../components/page/PageScaffold';
import { ApiError } from '../../shared/api/http';
import { getPasswordResetHref } from '../../shared/lib/authSiteHref';
import { createKoreanDateFormatter } from '../../shared/lib/date';
import { useBottomSheetClose } from '../../shared/hooks/useBottomSheetClose';
import {
  deleteProfileImage,
  getMyStatus,
  requestMyContactVerification,
  updateMyContact,
  updateMyProfile,
  uploadProfileImage,
} from './api';
import '../../styles/my-status.css';

const dateFormatter = createKoreanDateFormatter({ month: 'long', day: 'numeric' });
const pointDateFormatter = createKoreanDateFormatter({ month: 'long', day: 'numeric' });
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
  verificationCode: string;
  verificationRequested: boolean;
  currentPassword: string;
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

function pointDateLabel(value: string) {
  return pointDateFormatter.format(new Date(`${value}T00:00:00`));
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
  const [nicknameModalOpen, setNicknameModalOpen] = useState(false);
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
      setNicknameModalOpen(false);
    },
    onError: () =>
      showToast({
        title: '닉네임을 저장하지 못했습니다.',
        description: '입력한 닉네임을 확인해 주세요.',
        tone: 'danger',
      }),
  });

  const contactMutation = useMutation({
    mutationFn: (draft: ContactDraft) =>
      updateMyContact(draft.field, draft.value, draft.verificationCode, draft.currentPassword),
    onSuccess: async (_, draft) => {
      await queryClient.invalidateQueries({ queryKey: ['my-status'] });
      setContactDraft(null);
      showToast({
        title: `${draft.field === 'email' ? '이메일을' : '전화번호를'} 변경했습니다.`,
        tone: 'success',
      });
    },
    onError: (error) =>
      showToast({
        title:
          error instanceof ApiError &&
          typeof error.payload === 'object' &&
          error.payload !== null &&
          'message' in error.payload &&
          typeof error.payload.message === 'string'
            ? error.payload.message
            : '연락처를 변경하지 못했습니다.',
        tone: 'danger',
      }),
  });

  const contactVerificationMutation = useMutation({
    mutationFn: ({ field, value }: Pick<ContactDraft, 'field' | 'value'>) =>
      requestMyContactVerification(field, value),
    onSuccess: () => {
      setContactDraft((current) =>
        current ? { ...current, verificationCode: '', verificationRequested: true } : current,
      );
      showToast({ title: '인증번호를 보냈습니다.', tone: 'success' });
    },
    onError: () => showToast({ title: '인증번호를 보내지 못했습니다.', tone: 'danger' }),
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

  const closeProfileCrop = () => {
    setCropDraft((current) => {
      if (current) URL.revokeObjectURL(current.previewUrl);
      return null;
    });
    cropDragRef.current = null;
  };
  const cropSheet = useBottomSheetClose(closeProfileCrop);
  const nicknameSheet = useBottomSheetClose(() => setNicknameModalOpen(false));
  const contactSheet = useBottomSheetClose(() => setContactDraft(null));

  const updateCropDraft = (updater: (current: CropDraft) => CropDraft) => {
    setCropDraft((current) => (current ? clampCropDraft(updater(current)) : current));
  };

  const selectProfileImage = (file?: File) => {
    cropSheet.resetClosing();
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
  const activityRequests = (
    status.latestActivityRequests?.length
      ? status.latestActivityRequests
      : status.latestActivityRequest
        ? [status.latestActivityRequest]
        : []
  ).slice(0, 2);
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
        <div className="status-profile-form">
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
                <span>({status.student.studentNo})</span>
              </div>
              {profileError ? <small className="status-profile-error">{profileError}</small> : null}
            </div>
          </div>

          <div className="status-contact-list">
            <div className="status-contact-row">
              <UserRound size={18} aria-hidden="true" />
              <span>{status.student.nickname || status.student.name}</span>
              <button
                type="button"
                onClick={() => {
                  nicknameSheet.resetClosing();
                  setNicknameDraft(status.student.nickname || status.student.name);
                  setNicknameModalOpen(true);
                }}
              >
                수정
              </button>
            </div>
            <div className="status-contact-row">
              <Phone size={18} aria-hidden="true" />
              <span>{maskPhone(status.student.phone)}</span>
              <button
                type="button"
                onClick={() => {
                  contactSheet.resetClosing();
                  setContactDraft({
                    field: 'phone',
                    value: '',
                    verificationCode: '',
                    verificationRequested: false,
                    currentPassword: '',
                  });
                }}
              >
                수정
              </button>
            </div>
            <div className="status-contact-row">
              <Mail size={18} aria-hidden="true" />
              <span>{maskEmail(status.student.email)}</span>
              <button
                type="button"
                onClick={() => {
                  contactSheet.resetClosing();
                  setContactDraft({
                    field: 'email',
                    value: '',
                    verificationCode: '',
                    verificationRequested: false,
                    currentPassword: '',
                  });
                }}
              >
                수정
              </button>
            </div>
            <div className="status-contact-row">
              <KeyRound size={18} aria-hidden="true" />
              <span>비밀번호</span>
              <a href={getPasswordResetHref(String(status.student.studentNo), '/my-status')}>
                수정
              </a>
            </div>
          </div>
        </div>
      </section>

      <section className="status-overview" aria-labelledby="status-points-title">
        <header className="status-section-heading">
          <div className="status-heading-with-chips">
            <h2 id="status-points-title">최근 상벌점</h2>
            <div className="status-point-chips" aria-label="상벌점 요약">
              <span className="is-positive">
                상점 <strong>{Math.abs(status.points.meritPoint)}</strong>
              </span>
              <span className="is-negative">
                벌점 <strong>{Math.abs(status.points.penaltyPoint)}</strong>
              </span>
              <span className="is-total">
                합계 <strong>{String(status.points.currentPoint)}</strong>
              </span>
            </div>
          </div>
          <Link to="/points" aria-label="상벌점 더보기">
            더보기 <ChevronRight size={14} aria-hidden="true" />
          </Link>
        </header>
        <div className="status-point-preview">
          {status.points.records.length ? (
            status.points.records.slice(0, 3).map((record) => (
              <div key={record.id}>
                <span
                  className={`status-point-preview__badge ${record.point >= 0 ? 'is-positive' : 'is-negative'}`}
                >
                  {record.point >= 0 ? '상점' : '벌점'} {signedPoint(record.point)}
                </span>
                <span className="status-point-preview__reason">
                  {record.comment || record.reason}
                </span>
                <time>{pointDateLabel(record.baseDate)}</time>
                <small className="status-point-preview__processor">{record.teacherName}</small>
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
            search={{ field: 'participants', q: status.student.name }}
            aria-label="탐구활동서 더보기"
          >
            더보기 <ChevronRight size={14} aria-hidden="true" />
          </Link>
        </header>
        {activityRequests.length ? (
          <div className="status-activity__list">
            {activityRequests.map((request) => (
              <Link
                className="status-activity__row"
                to="/activity-requests/$requestId"
                params={{ requestId: String(request.id) }}
                key={request.id}
              >
                <strong>{request.purpose}</strong>
                <span className="status-activity__meta">
                  <span>
                    <CalendarDays size={14} aria-hidden="true" />
                    {dateFormatter.format(new Date(request.startsAt))}
                  </span>
                  <span>
                    <Clock3 size={14} aria-hidden="true" />
                    {activityTimeLabel(request.activitySlotIds, request.startsAt, request.endsAt)}
                  </span>
                  <span>
                    <MapPin size={14} aria-hidden="true" />
                    {request.location}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <p className="status-activity__empty">최근 신청 내역이 없습니다.</p>
        )}
      </section>
      <section className="status-overview" aria-labelledby="status-life-title">
        <header className="status-section-heading">
          <h2 id="status-life-title">기타 정보</h2>
        </header>
        <div className="status-life" aria-label="기타 정보 요약">
          <article>
            <BedDouble size={20} aria-hidden="true" />
            <div>
              <span>기숙사</span>
              <strong>
                {status.dorm ? `${status.dorm.dormName} ${status.dorm.roomName}` : '미배정'}
              </strong>
              {status.dorm ? <small>{formatDormBedPosition(status.dorm.bedPosition)}</small> : null}
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

      {cropDraft && cropGeometry ? (
        <div className={`status-crop-backdrop${cropSheet.isClosing ? ' is-closing' : ''}`}>
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
                onClick={() => cropSheet.requestClose()}
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
                onClick={() => cropSheet.requestClose()}
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

      {nicknameModalOpen ? (
        <div className={`status-crop-backdrop${nicknameSheet.isClosing ? ' is-closing' : ''}`}>
          <section
            className="status-contact-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="status-nickname-title"
          >
            <header>
              <h2 id="status-nickname-title">닉네임 변경</h2>
              <button type="button" aria-label="닫기" onClick={() => nicknameSheet.requestClose()}>
                <X size={19} aria-hidden="true" />
              </button>
            </header>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (!profileMutation.isPending) profileMutation.mutate();
              }}
            >
              <label className="sr-only" htmlFor="status-nickname-value">
                닉네임
              </label>
              <input
                id="status-nickname-value"
                autoFocus
                maxLength={16}
                onChange={(event) => setNicknameDraft(event.target.value)}
                placeholder="닉네임을 입력해주세요."
                value={nickname}
                required
              />
              <div className="status-contact-modal__actions">
                <button type="button" onClick={() => nicknameSheet.requestClose()}>
                  취소
                </button>
                <button type="submit" disabled={profileMutation.isPending || !nickname.trim()}>
                  {profileMutation.isPending ? '변경 중…' : '변경'}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {contactDraft ? (
        <div className={`status-crop-backdrop${contactSheet.isClosing ? ' is-closing' : ''}`}>
          <section
            className="status-contact-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="status-contact-title"
          >
            <header>
              <h2 id="status-contact-title">
                {contactDraft.field === 'email' ? '이메일 변경' : '전화번호 변경'}
              </h2>
              <button type="button" aria-label="닫기" onClick={() => contactSheet.requestClose()}>
                <X size={19} aria-hidden="true" />
              </button>
            </header>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (
                  !contactDraft.verificationRequested ||
                  !/^\d{6}$/.test(contactDraft.verificationCode)
                ) {
                  showToast({
                    title: `${contactDraft.field === 'email' ? '이메일' : '전화번호'} 인증을 완료해 주세요.`,
                    tone: 'danger',
                  });
                  return;
                }
                if (!contactDraft.currentPassword) {
                  showToast({ title: '현재 비밀번호를 입력해 주세요.', tone: 'danger' });
                  return;
                }
                if (!contactMutation.isPending) contactMutation.mutate(contactDraft);
              }}
            >
              <p className="status-contact-modal__lead">
                <strong>{status.student.name}</strong>님의{' '}
                <em>{contactDraft.field === 'email' ? '이메일을' : '전화번호를'}</em> 변경합니다.
              </p>
              <label className="status-contact-password-field" htmlFor="status-contact-password">
                <span>현재 비밀번호</span>
                <input
                  id="status-contact-password"
                  autoComplete="current-password"
                  type="password"
                  value={contactDraft.currentPassword}
                  onChange={(event) =>
                    setContactDraft((current) =>
                      current ? { ...current, currentPassword: event.target.value } : current,
                    )
                  }
                  placeholder="현재 비밀번호를 입력해주세요."
                  required
                />
              </label>
              <div className="status-contact-current">
                {contactDraft.field === 'email' ? (
                  <Mail size={17} aria-hidden="true" />
                ) : (
                  <Phone size={17} aria-hidden="true" />
                )}
                <span>
                  {contactDraft.field === 'email'
                    ? maskEmail(status.student.email)
                    : maskPhone(status.student.phone)}
                </span>
              </div>
              <label className="sr-only" htmlFor="status-contact-value">
                {contactDraft.field === 'email' ? '새 이메일' : '새 전화번호'}
              </label>
              <div className="status-contact-verification">
                <input
                  id="status-contact-value"
                  autoFocus
                  autoComplete={contactDraft.field === 'email' ? 'email' : 'tel'}
                  inputMode={contactDraft.field === 'email' ? 'email' : 'tel'}
                  type={contactDraft.field === 'email' ? 'email' : 'tel'}
                  value={contactDraft.value}
                  onChange={(event) =>
                    setContactDraft((current) =>
                      current
                        ? {
                            ...current,
                            value: event.target.value,
                            verificationCode: '',
                            verificationRequested: false,
                          }
                        : current,
                    )
                  }
                  placeholder={`새 ${contactDraft.field === 'email' ? '이메일' : '전화번호'}를 입력해주세요.`}
                  required
                />
                <button
                  type="button"
                  disabled={contactVerificationMutation.isPending || !contactDraft.value.trim()}
                  onClick={() =>
                    contactVerificationMutation.mutate({
                      field: contactDraft.field,
                      value: contactDraft.value,
                    })
                  }
                >
                  {contactVerificationMutation.isPending
                    ? '전송 중'
                    : contactDraft.verificationRequested
                      ? '재전송'
                      : '인증'}
                </button>
              </div>
              {contactDraft.verificationRequested ? (
                <>
                  <label className="sr-only" htmlFor="status-contact-code">
                    인증번호
                  </label>
                  <input
                    id="status-contact-code"
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    value={contactDraft.verificationCode}
                    onChange={(event) =>
                      setContactDraft((current) =>
                        current
                          ? {
                              ...current,
                              verificationCode: event.target.value.replace(/\D/g, '').slice(0, 6),
                            }
                          : current,
                      )
                    }
                    placeholder="6자리 인증번호를 입력해주세요."
                    required
                  />
                </>
              ) : null}
              <div className="status-contact-modal__actions">
                <button type="button" onClick={() => contactSheet.requestClose()}>
                  취소
                </button>
                <button type="submit" disabled={contactMutation.isPending}>
                  {contactMutation.isPending ? '변경 중…' : '변경'}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  );
}
