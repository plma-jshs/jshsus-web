import { Module } from '@nestjs/common';
import { EmailVerificationService } from './email-verification.service';
import { SendonPasswordResetService } from './sendon-password-reset.service';
import { AuthDeliveryService } from './auth-delivery.service';

@Module({
  providers: [SendonPasswordResetService, EmailVerificationService, AuthDeliveryService],
  exports: [AuthDeliveryService],
})
export class MessagingModule {}
