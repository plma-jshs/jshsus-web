import {
  BadRequestException,
  Injectable,
  type ArgumentMetadata,
  type PipeTransform,
} from '@nestjs/common';

@Injectable()
export class RouteParameterPipe implements PipeTransform {
  transform(value: unknown, metadata: ArgumentMetadata) {
    if (metadata.type !== 'param' || metadata.data !== 'id') {
      return value;
    }

    const id = typeof value === 'number' ? value : Number(value);
    if (!Number.isSafeInteger(id) || id <= 0) {
      throw new BadRequestException('Route id must be a positive integer.');
    }

    return id;
  }
}
