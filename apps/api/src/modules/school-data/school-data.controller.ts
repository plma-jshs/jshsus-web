import { Controller, Get, Query } from '@nestjs/common';
import { RateLimit } from '../../shared/security/rate-limit.guard';
import { SchoolDataService } from './school-data.service';

@Controller('school-data')
@RateLimit({ max: 30, windowSeconds: 60 })
export class SchoolDataController {
  constructor(private readonly schoolDataService: SchoolDataService) {}

  @Get('meals')
  meals(@Query('date') date?: string) {
    return this.schoolDataService.getMeals(date);
  }

  @Get('calendar')
  calendar(@Query('from') from?: string, @Query('to') to?: string) {
    return this.schoolDataService.getCalendar(from, to);
  }
}
