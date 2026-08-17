import { useState, type ImgHTMLAttributes } from 'react';

type ResilientImageProps = ImgHTMLAttributes<HTMLImageElement> & {
  fallbackLabel?: string;
};

export function ResilientImage({
  src,
  alt,
  className,
  fallbackLabel = '이미지를 불러오지 못했습니다.',
  loading = 'lazy',
  decoding = 'async',
  onError,
  ...props
}: ResilientImageProps) {
  const [failedSource, setFailedSource] = useState<string | undefined>();
  const failed = Boolean(src && failedSource === src);

  if (failed) {
    return (
      <span
        className={['ui-image-fallback', className ?? ''].filter(Boolean).join(' ')}
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
      alt={alt ?? ''}
      loading={loading}
      decoding={decoding}
      onError={(event) => {
        setFailedSource(src);
        onError?.(event);
      }}
    />
  );
}
