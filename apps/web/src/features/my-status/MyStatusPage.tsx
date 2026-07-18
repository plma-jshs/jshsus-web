import type { FormEvent, PointerEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { BedDouble, CircleUserRound, ClipboardCheck, Smartphone, X } from 'lucide-react';
import { useToast } from '../../components/feedback/Toast';
import { PageScaffold, PageState } from '../../components/page/PageScaffold';
import { listBreadcrumbs } from '../../components/page/pageHierarchy';
import { ApiError } from '../../shared/api/http';
import { createKoreanDateFormatter } from '../../shared/lib/date';
import { deleteProfileImage, getMyStatus, updateMyProfile, uploadProfileImage } from './api';
import { PointsSummary } from './PointsSummary';
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
        description: '다른 사용자가 쓰는 닉네임인지 확인해 주세요.',
        tone: 'danger',
      }),
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
      <PageScaffold
        breadcrumbs={listBreadcrumbs('myStatus')}
        title="마이페이지"
        width="wide"
        variant="workspace"
      >
        <PageState kind="loading" title="마이페이지를 불러오는 중입니다." variant="page" />
      </PageScaffold>
    );
  }

  if (statusQuery.isError || !statusQuery.data) {
    const error = statusQuery.error;
    const statusCode = error instanceof ApiError ? error.status : undefined;
    const isUnauthenticated = statusCode === 401;
    const isStudentUnlinked = statusCode === 400 || statusCode === 404;

    return (
      <PageScaffold
        breadcrumbs={listBreadcrumbs('myStatus')}
        title="마이페이지"
        width="wide"
        variant="workspace"
      >
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
      </PageScaffold>
    );
  }

  const status = statusQuery.data;
  const cropGeometry = cropDraft ? getCropGeometry(cropDraft) : null;

  return (
    <PageScaffold
      breadcrumbs={listBreadcrumbs('myStatus')}
      title="마이페이지"
      description="내 계정과 학교생활 정보를 확인하세요."
      width="wide"
      variant="workspace"
    >
      <section className="status-profile-card" aria-label="프로필 정보">
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
                <CircleUserRound size={44} aria-hidden="true" />
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
            <form className="status-profile-inline-form" onSubmit={submitProfile}>
              <label className="sr-only" htmlFor="profile-nickname">
                닉네임
              </label>
              <input
                id="profile-nickname"
                maxLength={16}
                onChange={(event) => setNicknameDraft(event.target.value)}
                placeholder="닉네임"
                type="text"
                value={nickname}
              />
              <button
                className="detail-primary-button"
                disabled={profileMutation.isPending}
                type="submit"
              >
                {profileMutation.isPending ? '저장 중…' : '저장'}
              </button>
            </form>
            <p className="status-student-meta">
              <span>{status.student.grade}학년</span>
              <span>{status.student.classNo}반</span>
              <span>{status.student.number}번</span>
              <span>{status.student.name}</span>
            </p>
            {profileError ? <small className="status-profile-error">{profileError}</small> : null}
          </div>
        </div>
      </section>

      <section className="status-overview" aria-labelledby="status-points-title">
        <header className="status-section-heading">
          <h2 id="status-points-title">상벌점</h2>
          <Link to="/points">자세히 보기</Link>
        </header>
        <PointsSummary points={status.points} />
      </section>

      <section className="status-activity" aria-labelledby="status-activity-title">
        <header>
          <ClipboardCheck size={18} aria-hidden="true" />
          <h2 id="status-activity-title">최근 탐구활동서</h2>
          <Link to="/activity-requests">자세히 보기</Link>
        </header>
        {status.latestActivityRequest ? (
          <Link
            className="status-activity__row"
            to="/activity-requests/$requestId"
            params={{ requestId: String(status.latestActivityRequest.id) }}
          >
            <strong>{status.latestActivityRequest.purpose}</strong>
            <span>
              #{status.latestActivityRequest.id} · {status.latestActivityRequest.studentName} · 대표
              {' · '}
              {dateFormatter.format(new Date(status.latestActivityRequest.startsAt))} ·{' '}
              {status.latestActivityRequest.location}
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
              <strong>{status.deviceCase ? `${status.deviceCase.id}번` : '미연결'}</strong>
              <small>
                {status.deviceCase
                  ? `${status.deviceCase.isOpen ? '열림' : '닫힘'} · ${status.deviceCase.isConnected ? '연결 정상' : '연결 끊김'}`
                  : '연결 정보 없음'}
              </small>
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
    </PageScaffold>
  );
}
