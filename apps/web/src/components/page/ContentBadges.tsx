const RECENT_CONTENT_WINDOW_MS = 2 * 24 * 60 * 60 * 1000;

export function isRecentContent(dateValue?: string | null) {
  if (!dateValue) return false;
  const time = new Date(dateValue).getTime();
  if (!Number.isFinite(time)) return false;
  const age = Date.now() - time;
  return age >= 0 && age <= RECENT_CONTENT_WINDOW_MS;
}

export function ContentBadges({ createdAt }: { createdAt?: string | null; pinned?: boolean }) {
  const isRecent = isRecentContent(createdAt);
  if (!isRecent) return null;

  return (
    <span className="content-badges">
      <span className="content-new-badge" aria-label="최신 글" />
    </span>
  );
}
