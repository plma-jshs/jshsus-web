import { createPortal } from 'react-dom';
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { ActivityRequestParticipant } from '@jshsus/types';

type FallbackParticipant = { studentNo: number; studentName: string };

function formatParticipant(
  student: Pick<ActivityRequestParticipant, 'studentNo' | 'studentName' | 'isRepresentative'>,
) {
  return `${student.studentNo} ${student.studentName}${student.isRepresentative ? '(대표)' : ''}`;
}

function resolveParticipants(
  participants: ActivityRequestParticipant[],
  fallback: FallbackParticipant,
) {
  return participants.length
    ? participants
    : [
        {
          studentId: fallback.studentNo,
          studentNo: fallback.studentNo,
          studentName: fallback.studentName,
          isRepresentative: true,
        },
      ];
}

export function ActivityParticipants({
  participants,
  fallback,
  className,
}: {
  participants: ActivityRequestParticipant[];
  fallback: FallbackParticipant;
  className?: string;
}) {
  const students = resolveParticipants(participants, fallback);
  const representativeIndex = Math.max(
    0,
    students.findIndex((student) => student.isRepresentative),
  );
  const representative = students[representativeIndex];
  const others = students.filter((_, index) => index !== representativeIndex);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const popoverId = `activity-participants-popover-${useId().replace(/:/g, '')}`;
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const width = popoverRef.current?.offsetWidth ?? Math.min(260, window.innerWidth - 24);
    const left = Math.min(Math.max(12, rect.left), Math.max(12, window.innerWidth - width - 12));
    const popoverHeight = popoverRef.current?.offsetHeight ?? 180;
    const top =
      rect.bottom + 8 + popoverHeight <= window.innerHeight
        ? rect.bottom + 8
        : Math.max(12, rect.top - popoverHeight - 8);
    setPosition({ top, left });
  }, []);

  useLayoutEffect(() => {
    if (!open) return undefined;
    updatePosition();
    const frame = window.requestAnimationFrame(updatePosition);
    return () => window.cancelAnimationFrame(frame);
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return undefined;
    const handleOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (triggerRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', handleOutsidePointer);
    document.addEventListener('keydown', handleEscape);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      document.removeEventListener('pointerdown', handleOutsidePointer);
      document.removeEventListener('keydown', handleEscape);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, updatePosition]);

  if (!representative) return <span className={className}>-</span>;
  if (students.length < 3) {
    return <span className={className}>{students.map(formatParticipant).join(', ')}</span>;
  }

  const summaryClassName = ['activity-participants-summary', className].filter(Boolean).join(' ');
  return (
    <span
      className="activity-participants-popover-anchor"
      onMouseEnter={() => {
        setOpen(true);
      }}
      onMouseLeave={(event) => {
        const nextTarget = event.relatedTarget;
        if (nextTarget instanceof Node && popoverRef.current?.contains(nextTarget)) return;
        setOpen(false);
      }}
    >
      <span className={summaryClassName}>
        {formatParticipant(representative)}{' '}
        <button
          ref={triggerRef}
          aria-controls={popoverId}
          aria-expanded={open}
          className="activity-participants-popover-trigger"
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => event.stopPropagation()}
        >
          외 {others.length}명
        </button>
      </span>
      {open && position && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={popoverRef}
              className="activity-participants-popover"
              id={popoverId}
              role="tooltip"
              style={{ top: position.top, left: position.left }}
              onMouseLeave={() => setOpen(false)}
              onClick={(event) => event.stopPropagation()}
            >
              <strong>참여 학생 {students.length}명</strong>
              <ul
                className={`activity-participants-popover__list ${
                  students.length <= 4
                    ? 'activity-participants-popover__list--single'
                    : 'activity-participants-popover__list--double'
                }`}
                style={
                  students.length > 4
                    ? { gridTemplateRows: `repeat(${Math.ceil(students.length / 2)}, auto)` }
                    : undefined
                }
              >
                {students.map((student) => (
                  <li key={student.studentId}>
                    <span className="activity-participants-popover__student-number">
                      {student.studentNo}
                    </span>
                    <span>
                      {student.studentName}
                      {student.isRepresentative ? '(대표)' : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </div>,
            document.body,
          )
        : null}
    </span>
  );
}
