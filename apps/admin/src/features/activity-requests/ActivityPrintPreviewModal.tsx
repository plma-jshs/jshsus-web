import { useEffect, useRef } from 'react';
import { Printer, X } from 'lucide-react';
import { useReactToPrint } from 'react-to-print';
import type { ActivityRequestPrintBatch } from '@jshsus/types';
import { ActivityPrintBatch } from './ActivityPrintBatch';

export function ActivityPrintPreviewModal({
  batch,
  onClose,
}: {
  batch: ActivityRequestPrintBatch;
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
          <h2 id="activity-print-preview-title">인쇄 미리보기</h2>
          <button type="button" aria-label="인쇄 미리보기 닫기" onClick={onClose}>
            <X size={20} aria-hidden="true" />
          </button>
        </header>
        <div className="activity-print-preview-modal__body">
          <div ref={contentRef} className="activity-print-printable">
            <ActivityPrintBatch batch={batch} preview />
          </div>
        </div>
        <footer className="activity-print-preview-modal__actions">
          <button className="secondary-button" type="button" onClick={onClose}>
            취소
          </button>
          <button className="primary-button" type="button" onClick={handlePrint}>
            <Printer size={16} aria-hidden="true" />
            인쇄
          </button>
        </footer>
      </div>
    </div>
  );
}
