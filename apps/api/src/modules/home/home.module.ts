import { Module } from '@nestjs/common';
import { ContentModule } from '../content/content.module';
import { PetitionsModule } from '../petitions/petitions.module';
import { SchoolDataModule } from '../school-data/school-data.module';
import { HomeController } from './home.controller';

@Module({
  imports: [ContentModule, PetitionsModule, SchoolDataModule],
  controllers: [HomeController],
})
export class HomeModule {}
