import { ResilientImage as SharedResilientImage } from '@jshsus/ui';
import type { ResilientImageProps } from '@jshsus/ui';

export type { ResilientImageProps } from '@jshsus/ui';

/**
 * Keeps image failures from leaving a broken-image icon in cards and profiles.
 * The successful path intentionally remains a regular <img>, so existing
 * sizing, loading and decoding behavior is preserved by the caller's classes.
 */
export function ResilientImage({ fallbackClassName, ...props }: ResilientImageProps) {
  return (
    <SharedResilientImage
      {...props}
      className={['resilient-image', props.className].filter(Boolean).join(' ')}
      fallbackClassName={['resilient-image--fallback', fallbackClassName].filter(Boolean).join(' ')}
    />
  );
}
