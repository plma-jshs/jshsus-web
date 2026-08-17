import { useEffect, useRef } from 'react';
import { Printer, X } from 'lucide-react';
import { useReactToPrint } from 'react-to-print';
import type { ActivityPrintFloor, ActivityRequestPrintBatch } from '@jshsus/types';
import { DialogActions } from '../../components/ui';
import { ActivityPrintBatch } from './ActivityPrintBatch';

const floorTabs: readonly { value: ActivityPrintFloor; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 2, label: '2층' },
  { value: 3, label: '3층' },
  { value: 4, label: '4층' },
];

export function ActivityPrintPreviewModal({
  batch,
  floor,
  isLoading = false,
  errorMessage,
  onFloorChange,
  onClose,
}: {
  batch: ActivityRequestPrintBatch | null;
  floor: ActivityPrintFloor;
  isLoading?: boolean;
  errorMessage?: string;
  onFloorChange: (floor: ActivityPrintFloor) => void;
  onClose: () => void;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const handlePrint = useReactToPrint({
    contentRef,
    documentTitle: '탐구활동서 인쇄',
  });

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  return (
    <div
      className="activity-print-preview-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="activity-print-preview-title"
    >
      <button
        className="activity-print-preview-modal__backdrop"
        type="button"
        aria-label="인쇄 미리보기 닫기"
        onClick={onClose}
      />
      <div className="activity-print-preview-modal__dialog">
        <header className="activity-print-preview-modal__header">
          <div className="activity-print-preview-modal__heading">
            <h2 id="activity-print-preview-title">인쇄 미리보기</h2>
            <div
              className="activity-print-preview-modal__tabs"
              role="tablist"
              aria-label="인쇄 범위"
            >
              {floorTabs.map((tab) => (
                <button
                  key={tab.value}
                  className={tab.value === floor ? 'is-active' : undefined}
                  type="button"
                  role="tab"
                  aria-selected={tab.value === floor}
                  disabled={isLoading}
                  onClick={() => onFloorChange(tab.value)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
          <button
            className="activity-print-preview-modal__close"
            type="button"
            aria-label="인쇄 미리보기 닫기"
            onClick={onClose}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </header>
        <div className="activity-print-preview-modal__body">
          {isLoading ? (
            <p className="activity-print-preview-modal__state">인쇄 자료를 준비하는 중입니다.</p>
          ) : null}
          {!isLoading && errorMessage ? (
            <p className="activity-print-preview-modal__state is-error">{errorMessage}</p>
          ) : null}
          {!isLoading && !errorMessage && batch ? (
            <div ref={contentRef} className="activity-print-printable">
              <ActivityPrintBatch batch={batch} preview />
            </div>
          ) : null}
          {!isLoading && !errorMessage && !batch ? (
            <p className="activity-print-preview-modal__state">인쇄할 자료가 없습니다.</p>
          ) : null}
        </div>
        <DialogActions
          className="activity-print-preview-modal__actions"
          onClose={onClose}
          onConfirm={handlePrint}
          confirmLabel={
            <>
              <Printer size={16} aria-hidden="true" />
              인쇄
            </>
          }
          confirmDisabled={isLoading || !batch}
          confirmType="button"
        />
      </div>
    </div>
  );
}
