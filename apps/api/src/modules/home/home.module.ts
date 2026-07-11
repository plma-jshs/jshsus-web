import { Module } from '@nestjs/common';
import { ContentModule } from '../content/content.module';
import { PetitionsModule } from '../petitions/petitions.module';
import { HomeController } from './home.controller';

@Module({
  imports: [ContentModule, PetitionsModule],
  controllers: [HomeController],
})
export class HomeModule {}
