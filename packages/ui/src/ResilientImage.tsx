import { useState, type ImgHTMLAttributes } from 'react';

export type ResilientImageProps = ImgHTMLAttributes<HTMLImageElement> & {
  fallbackLabel?: string;
  /** Lets each app keep its existing fallback styling while sharing behavior. */
  fallbackClassName?: string;
};

/**
 * A small, app-agnostic image primitive. It keeps loading/decoding defaults,
 * handles a failed source once, and exposes an accessible fallback instead of
 * leaking a browser broken-image icon into cards and profiles.
 */
export function ResilientImage({
  src,
  alt = '',
  className,
  fallbackLabel = '이미지를 불러오지 못했습니다.',
  fallbackClassName = 'ui-image-fallback',
  loading = 'lazy',
  decoding = 'async',
  onError,
  ...props
}: ResilientImageProps) {
  const [failedSource, setFailedSource] = useState<string>();
  const hasFailed = Boolean(src && failedSource === src);

  if (hasFailed) {
    return (
      <span
        className={[fallbackClassName, className].filter(Boolean).join(' ') || undefined}
        role="img"
        aria-label={fallbackLabel}
      >
        {fallbackLabel}
      </span>
    );
  }

  return (
    <img
      {...props}
      className={className}
      src={src}
      alt={alt}
      loading={loading}
      decoding={decoding}
      onError={(event) => {
        setFailedSource(src);
        onError?.(event);
      }}
    />
  );
}
