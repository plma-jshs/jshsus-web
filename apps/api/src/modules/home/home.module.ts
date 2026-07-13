import { Module } from '@nestjs/common';
import { BoardsModule } from '../boards/boards.module';
import { NoticesModule } from '../notices/notices.module';
import { PetitionsModule } from '../petitions/petitions.module';
import { SchoolDataModule } from '../school-data/school-data.module';
import { HomeController } from './home.controller';

@Module({
  imports: [BoardsModule, NoticesModule, PetitionsModule, SchoolDataModule],
  controllers: [HomeController],
})
export class HomeModule {}
