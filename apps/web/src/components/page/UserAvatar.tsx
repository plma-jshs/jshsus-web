import { CircleUserRound } from 'lucide-react';

export function UserAvatar({ imageUrl, className }: { imageUrl?: string; className?: string }) {
  return (
    <span className={['user-avatar', className].filter(Boolean).join(' ')} aria-hidden="true">
      {imageUrl ? <img src={imageUrl} alt="" /> : <CircleUserRound />}
    </span>
  );
}
