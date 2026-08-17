import type { ImgHTMLAttributes } from 'react';
import { useState } from 'react';

type ResilientImageProps = ImgHTMLAttributes<HTMLImageElement> & {
  fallbackLabel?: string;
};

/**
 * Keeps image failures from leaving a broken-image icon in cards and profiles.
 * The successful path intentionally remains a regular <img>, so existing
 * sizing, loading and decoding behavior is preserved by the caller's classes.
 */
export function ResilientImage({
  src,
  alt = '',
  className,
  fallbackLabel = '이미지를 불러오지 못했습니다.',
  loading = 'lazy',
  decoding = 'async',
  onError,
  ...props
}: ResilientImageProps) {
  const [failedSource, setFailedSource] = useState<string>();
  const hasFailed = Boolean(src && failedSource === src);
  const classes = ['resilient-image', className].filter(Boolean).join(' ');

  if (hasFailed) {
    return (
      <span
        className={`${classes} resilient-image--fallback`}
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
      className={classes || undefined}
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
