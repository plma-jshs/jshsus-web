import { ResilientImage as SharedResilientImage } from '@jshsus/ui';
import type { ResilientImageProps } from '@jshsus/ui';

export type { ResilientImageProps } from '@jshsus/ui';

export function ResilientImage({ fallbackClassName, ...props }: ResilientImageProps) {
  return (
    <SharedResilientImage
      {...props}
      fallbackClassName={['ui-image-fallback', fallbackClassName].filter(Boolean).join(' ')}
    />
  );
}
