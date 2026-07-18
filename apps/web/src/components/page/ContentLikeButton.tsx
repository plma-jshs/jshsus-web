import { Heart } from 'lucide-react';
import { useState } from 'react';

export function ContentLikeButton({
  liked,
  likeCount,
  disabled = false,
  onClick,
  compact = false,
}: {
  liked: boolean;
  likeCount: number;
  disabled?: boolean;
  onClick: () => void;
  compact?: boolean;
}) {
  const [pulseSequence, setPulseSequence] = useState(0);

  return (
    <button
      className={`content-like-button${liked ? ' is-liked' : ''}${compact ? ' is-compact' : ''}`}
      type="button"
      aria-pressed={liked}
      aria-label={liked ? `좋아요 취소, 현재 ${likeCount}개` : `좋아요, 현재 ${likeCount}개`}
      disabled={disabled}
      onClick={() => {
        setPulseSequence((current) => current + 1);
        onClick();
      }}
    >
      <span
        className={`content-like-button__heart${pulseSequence ? ' is-pulsing' : ''}`}
        key={pulseSequence}
      >
        <Heart size={15} fill={liked ? 'currentColor' : 'none'} aria-hidden="true" />
      </span>
      <span>좋아요</span>
      <strong>{likeCount}</strong>
    </button>
  );
}
