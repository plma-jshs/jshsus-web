import { ResilientImage } from './ResilientImage';

export function UserAvatar({ imageUrl, className }: { imageUrl?: string; className?: string }) {
  const resolvedImageUrl = imageUrl || '/assets/default-avatar.png';
  return (
    <span className={['user-avatar', className].filter(Boolean).join(' ')} aria-hidden="true">
      <ResilientImage
        className={!imageUrl ? 'user-avatar__image--default' : undefined}
        src={resolvedImageUrl}
        alt=""
      />
    </span>
  );
}
