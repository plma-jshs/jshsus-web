import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import * as schema from '@jshsus/db';
import type {
  AccountActivationBulkIssueResult,
  AccountActivationCompleteResult,
  AccountActivationIdentityType,
  AccountActivationIssueResult,
  AccountActivationLookupResult,
} from '@jshsus/types';
import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { DatabaseService, type AppDatabase } from '../database/database.service';
import {
  deriveStudentNumberParts,
  normalizePhoneNumber,
  normalizeStudentGender,
  toStoredStudentGender,
} from '../admin/identity.policy';
import { env } from '../../shared/config/env';
import { CognitoAuthError, CognitoAuthService, type CognitoSurface } from './cognito-auth.service';
import { RedisService } from '../redis/redis.service';
import { SendonPasswordResetService } from './sendon-password-reset.service';
import { EmailVerificationService } from './email-verification.service';

const ACTIVATION_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ACTIVATION_CODE_LENGTH = 12;
const MAX_ACTIVATION_ATTEMPTS = 10;
const PHONE_VERIFICATION_TTL_SECONDS = 300;
const EMAIL_VERIFICATION_TTL_SECONDS = 300;

const activationIdentitySchema = z.object({
  identityType: z.enum(['student', 'staff']),
  identityNumber: z.coerce.number().int().positive(),
});

const activationIssueSchema = activationIdentitySchema.extend({
  schoolYear: z.coerce.number().int().min(2000).max(2100).optional(),
  force: z.boolean().optional().default(false),
});

const bulkActivationIssueSchema = z.object({
  identityType: z.literal('student').optional().default('student'),
  schoolYear: z.coerce.number().int().min(2000).max(2100).optional(),
  grade: z.coerce.number().int().min(1).max(3).optional(),
  classNo: z.coerce.number().int().min(1).max(20).optional(),
});

const genderSchema = z.preprocess(
  (value) => normalizeStudentGender(value) ?? value,
  z.enum(['male', 'female']),
);

const phoneSchema = z.preprocess((value) => normalizePhoneNumber(value) ?? value, z.string());

const activationCodeSchema = z.object({
  activationCode: z.string().trim().min(6).max(32),
});

const phoneVerificationRequestSchema = activationCodeSchema.extend({
  phone: phoneSchema.refine((value) => /^010\d{8}$/.test(value), {
    message: 'Phone number must start with 010.',
  }),
});

const emailVerificationRequestSchema = activationCodeSchema.extend({
  email: z.string().trim().email().max(255),
});

const completeActivationSchema = activationIdentitySchema.extend({
  activationCode: z.string().trim().min(6).max(32),
  name: z.string().trim().min(1).max(64).optional(),
  gender: genderSchema,
  email: z.string().trim().email().max(255),
  phone: phoneSchema.refine((value) => /^010\d{8}$/.test(value), {
    message: 'Phone number must start with 010.',
  }),
  phoneVerificationCode: z
    .string()
    .trim()
    .regex(/^\d{6}$/),
  emailVerificationCode: z
    .string()
    .trim()
    .regex(/^\d{6}$/),
  password: z.string().min(8).max(256),
});

type CompleteActivationInput = z.infer<typeof completeActivationSchema>;
type AppTransaction = Parameters<Parameters<AppDatabase['transaction']>[0]>[0];
type ValidatedIdentity = {
  identityType: AccountActivationIdentityType;
  identityNumber: number;
  schoolYear?: number;
};

function normalizeActivationCode(value: string) {
  return value.replace(/[\s-]/g, '').toLocaleUpperCase('en-US');
}

function generateActivationCode() {
  let code = '';
  while (code.length < ACTIVATION_CODE_LENGTH) {
    code += ACTIVATION_ALPHABET[randomInt(ACTIVATION_ALPHABET.length)];
  }
  return `${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8)}`;
}

function safeCompareHex(left: string, right: string) {
  const leftBuffer = Buffer.from(left, 'hex');
  const rightBuffer = Buffer.from(right, 'hex');
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

@Injectable()
export class AccountActivationService {
  constructor(
    private readonly database: DatabaseService,
    private readonly cognito: CognitoAuthService,
    private readonly redis: RedisService,
    private readonly sendon: SendonPasswordResetService,
    private readonly emailVerification: EmailVerificationService,
  ) {}

  async issue(body: unknown, actorId?: number | null): Promise<AccountActivationIssueResult> {
    const parsed = activationIssueSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten().fieldErrors);
    const input = {
      ...this.parseIdentity(parsed.data),
      schoolYear: parsed.data.schoolYear,
    };
    if (input.identityType === 'student') {
      input.schoolYear = await this.resolveActivationSchoolYear(input.schoolYear);
    }

    const code = await this.database.db.transaction(async (tx) => {
      await this.lockActiveSchoolYear(
        tx,
        input.identityType === 'student' ? input.schoolYear : undefined,
      );

      // Keep the same lock order as bulk issuance and account completion:
      // school year -> activation row -> enrollment row.
      const [existingCode] = await tx
        .select({
          attemptCount: schema.accountActivationCodes.attemptCount,
          usedAt: schema.accountActivationCodes.usedAt,
        })
        .from(schema.accountActivationCodes)
        .where(
          and(
            eq(schema.accountActivationCodes.identityType, input.identityType),
            eq(schema.accountActivationCodes.identityNumber, input.identityNumber),
          ),
        )
        .limit(1)
        .for('update');

      if (
        existingCode &&
        !existingCode.usedAt &&
        existingCode.attemptCount < MAX_ACTIVATION_ATTEMPTS &&
        !parsed.data.force
      ) {
        throw new ConflictException(
          '이미 사용 가능한 인증코드가 발급되어 있습니다. 기존 코드를 사용하거나 재발급을 선택해 주세요.',
        );
      }

      if (input.identityType === 'student') {
        await this.assertActiveEnrollment(input, tx);
      }

      const nextCode = generateActivationCode();
      const issuedAt = new Date();
      await tx
        .insert(schema.accountActivationCodes)
        .values({
          identityType: input.identityType,
          identityNumber: input.identityNumber,
          schoolYear: input.schoolYear ?? null,
          codeHash: this.hashCode(input, nextCode),
          codeLookupHash: this.hashCodeLookup(nextCode),
          attemptCount: 0,
          issuedById: actorId && actorId > 0 ? actorId : null,
          usedById: null,
          usedAt: null,
          createdAt: issuedAt,
          updatedAt: issuedAt,
        })
        .onDuplicateKeyUpdate({
          set: {
            codeHash: this.hashCode(input, nextCode),
            codeLookupHash: this.hashCodeLookup(nextCode),
            attemptCount: 0,
            schoolYear: input.schoolYear ?? null,
            issuedById: actorId && actorId > 0 ? actorId : null,
            usedById: null,
            usedAt: null,
            updatedAt: issuedAt,
          },
        });

      return nextCode;
    });

    await this.database.writeAudit({
      actorId,
      action: 'admin.account-activation.issue',
      targetType: input.identityType,
      targetId: input.identityNumber,
    });

    return {
      ok: true,
      identityType: input.identityType,
      identityNumber: input.identityNumber,
      schoolYear: input.schoolYear,
      code,
    };
  }

  async issueBulkStudents(
    body: unknown,
    actorId?: number | null,
  ): Promise<AccountActivationBulkIssueResult> {
    const parsed = bulkActivationIssueSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten().fieldErrors);

    const schoolYear = await this.resolveActivationSchoolYear(parsed.data.schoolYear);
    const filters = [
      eq(schema.studentEnrollments.schoolYear, schoolYear),
      eq(schema.studentEnrollments.status, 'active'),
    ];
    if (parsed.data.grade) filters.push(eq(schema.studentEnrollments.grade, parsed.data.grade));
    if (parsed.data.classNo) {
      filters.push(eq(schema.studentEnrollments.classNo, parsed.data.classNo));
    }

    const issued = await this.database.db.transaction(async (tx) => {
      await this.lockActiveSchoolYear(tx, schoolYear);
      const candidateRows = await tx
        .select({ identityNumber: schema.studentEnrollments.studentNo })
        .from(schema.studentEnrollments)
        .where(and(...filters))
        .orderBy(
          asc(schema.studentEnrollments.grade),
          asc(schema.studentEnrollments.classNo),
          asc(schema.studentEnrollments.number),
        );
      const candidateNumbers = [...new Set(candidateRows.map((row) => row.identityNumber))];
      if (candidateNumbers.length === 0) {
        throw new BadRequestException('No unregistered students matched the selected criteria.');
      }

      const lockActivationCodes = () =>
        tx
          .select({
            identityNumber: schema.accountActivationCodes.identityNumber,
            attemptCount: schema.accountActivationCodes.attemptCount,
            usedAt: schema.accountActivationCodes.usedAt,
          })
          .from(schema.accountActivationCodes)
          .where(
            and(
              eq(schema.accountActivationCodes.identityType, 'student'),
              inArray(schema.accountActivationCodes.identityNumber, candidateNumbers),
            ),
          )
          .for('update');

      // Lock activation rows first, matching the lock order used by account completion.
      // The second read after locking enrollments is necessary when another bulk request
      // inserted a new activation row while this transaction was waiting.
      await lockActivationCodes();
      const students = await tx
        .select({
          userId: schema.students.userId,
          identityNumber: schema.studentEnrollments.studentNo,
          name: schema.students.name,
        })
        .from(schema.studentEnrollments)
        .innerJoin(schema.students, eq(schema.studentEnrollments.studentId, schema.students.id))
        .where(and(...filters))
        .orderBy(
          asc(schema.studentEnrollments.grade),
          asc(schema.studentEnrollments.classNo),
          asc(schema.studentEnrollments.number),
        )
        .for('update');
      const activationCodes = await lockActivationCodes();
      const codeByIdentity = new Map(activationCodes.map((code) => [code.identityNumber, code]));
      const userIds = students.flatMap((student) => (student.userId ? [student.userId] : []));
      const authenticatedUserIds = new Set(
        userIds.length > 0
          ? (
              await tx
                .select({ userId: schema.authAccounts.userId })
                .from(schema.authAccounts)
                .where(
                  and(
                    inArray(schema.authAccounts.userId, userIds),
                    eq(schema.authAccounts.provider, 'cognito'),
                  ),
                )
            ).map((row) => row.userId)
          : [],
      );
      const unregisteredStudents = students.filter(
        (student) => !student.userId || !authenticatedUserIds.has(student.userId),
      );
      const pendingIdentityNumbers = new Set(
        activationCodes
          .filter((code) => !code.usedAt && code.attemptCount < MAX_ACTIVATION_ATTEMPTS)
          .map((code) => code.identityNumber),
      );
      const eligibleStudents = unregisteredStudents.filter(
        (student) => !pendingIdentityNumbers.has(student.identityNumber),
      );
      if (eligibleStudents.length === 0) {
        if (unregisteredStudents.length > 0) {
          throw new ConflictException(
            '아직 가입하지 않았지만 이미 사용 가능한 인증코드가 발급된 학생이 있습니다.',
          );
        }
        throw new BadRequestException('No unregistered students matched the selected criteria.');
      }

      const issuedAt = new Date();
      const codes = eligibleStudents.map((student) => ({
        ...student,
        code: generateActivationCode(),
      }));
      for (const item of codes) {
        const input = {
          identityType: 'student' as const,
          identityNumber: item.identityNumber,
        };
        const existingCode = codeByIdentity.get(item.identityNumber);
        if (
          existingCode &&
          !existingCode.usedAt &&
          existingCode.attemptCount < MAX_ACTIVATION_ATTEMPTS
        ) {
          throw new ConflictException(
            '동시에 다른 인증코드 발급 요청이 처리되었습니다. 목록을 새로고침해 주세요.',
          );
        }
        await tx
          .insert(schema.accountActivationCodes)
          .values({
            identityType: input.identityType,
            identityNumber: input.identityNumber,
            schoolYear,
            codeHash: this.hashCode(input, item.code),
            codeLookupHash: this.hashCodeLookup(item.code),
            attemptCount: 0,
            issuedById: actorId && actorId > 0 ? actorId : null,
            usedById: null,
            usedAt: null,
            createdAt: issuedAt,
            updatedAt: issuedAt,
          })
          .onDuplicateKeyUpdate({
            set: {
              codeHash: this.hashCode(input, item.code),
              codeLookupHash: this.hashCodeLookup(item.code),
              attemptCount: 0,
              schoolYear,
              issuedById: actorId && actorId > 0 ? actorId : null,
              usedById: null,
              usedAt: null,
              updatedAt: issuedAt,
            },
          });
      }

      return { issuedAt, codes };
    });

    await this.database.writeAudit({
      actorId,
      action: 'admin.account-activation.bulk-issue',
      targetType: 'student',
      targetId: `${schoolYear}:${parsed.data.grade ?? 'all'}:${parsed.data.classNo ?? 'all'}`,
    });

    return {
      ok: true,
      identityType: 'student',
      schoolYear,
      issuedAt: issued.issuedAt.toISOString(),
      total: issued.codes.length,
      codes: issued.codes.map(({ identityNumber, name, code }) => ({ identityNumber, name, code })),
    };
  }

  async lookup(body: unknown): Promise<AccountActivationLookupResult> {
    const parsed = activationCodeSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: 'ACCOUNT_ACTIVATION_CODE_INVALID',
        message: '인증코드를 확인해 주세요.',
      });
    }

    const activation = await this.findAvailableActivation(parsed.data.activationCode);
    const targetSchoolYear =
      activation.identityType === 'student'
        ? (activation.schoolYear ?? (await this.resolveActiveSchoolYear()))
        : undefined;
    const [student] =
      activation.identityType === 'student'
        ? await this.database.db
            .select({ name: schema.students.name })
            .from(schema.studentEnrollments)
            .innerJoin(schema.students, eq(schema.studentEnrollments.studentId, schema.students.id))
            .where(
              and(
                eq(schema.studentEnrollments.schoolYear, targetSchoolYear!),
                eq(schema.studentEnrollments.studentNo, activation.identityNumber),
                eq(schema.studentEnrollments.status, 'active'),
              ),
            )
            .limit(1)
        : [];
    if (activation.identityType === 'student' && !student) {
      throw new BadRequestException({
        code: 'ACCOUNT_ACTIVATION_CODE_INVALID',
        message: '명단에 등록된 학생만 계정을 만들 수 있습니다.',
      });
    }
    return {
      ok: true,
      identityType: activation.identityType,
      identityNumber: activation.identityNumber,
      name: student?.name,
      schoolYear: targetSchoolYear,
    };
  }

  async requestPhoneVerification(body: unknown): Promise<{ ok: true }> {
    const parsed = phoneVerificationRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: 'ACCOUNT_ACTIVATION_INVALID_INPUT',
        message: '인증코드와 전화번호를 확인해 주세요.',
      });
    }

    const activation = await this.findAvailableActivation(parsed.data.activationCode);
    const phone = parsed.data.phone;
    const code = String(randomInt(100_000, 1_000_000));
    const flowKey = this.phoneVerificationFlowKey(parsed.data.activationCode);
    await this.redis.setJson(
      flowKey,
      {
        identityType: activation.identityType,
        identityNumber: activation.identityNumber,
        phone,
        codeHash: this.hashPhoneVerificationCode(flowKey, phone, code),
        attemptCount: 0,
      },
      PHONE_VERIFICATION_TTL_SECONDS,
    );

    try {
      await this.sendon.sendVerificationCode({
        code,
        phone,
        purpose: 'account-activation',
      });
    } catch (error) {
      await this.redis.delete(flowKey);
      throw error;
    }

    return { ok: true };
  }

  async requestEmailVerification(body: unknown): Promise<{ ok: true }> {
    const parsed = emailVerificationRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: 'ACCOUNT_ACTIVATION_INVALID_INPUT',
        message: '인증코드와 이메일 주소를 확인해 주세요.',
      });
    }

    const activation = await this.findAvailableActivation(parsed.data.activationCode);
    const email = parsed.data.email.toLocaleLowerCase('en-US');
    const code = String(randomInt(100_000, 1_000_000));
    const flowKey = this.emailVerificationFlowKey(parsed.data.activationCode);
    await this.redis.setJson(
      flowKey,
      {
        identityType: activation.identityType,
        identityNumber: activation.identityNumber,
        email,
        codeHash: this.hashVerificationCode(flowKey, email, code),
        attemptCount: 0,
      },
      EMAIL_VERIFICATION_TTL_SECONDS,
    );

    try {
      await this.emailVerification.sendVerificationCode({
        code,
        email,
        purpose: 'account-activation',
      });
    } catch (error) {
      await this.redis.delete(flowKey);
      throw error;
    }

    return { ok: true };
  }

  async complete(
    body: unknown,
    _surface: CognitoSurface,
  ): Promise<AccountActivationCompleteResult> {
    const parsed = completeActivationSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: 'ACCOUNT_ACTIVATION_INVALID_INPUT',
        message: '입력한 계정 정보를 확인해 주세요.',
      });
    }

    const input = {
      ...parsed.data,
      identityNumber: this.validateIdentity(parsed.data),
      activationCode: normalizeActivationCode(parsed.data.activationCode),
      email: parsed.data.email.trim().toLocaleLowerCase('en-US'),
    };
    if (input.identityType === 'staff' && !input.name) {
      throw new BadRequestException({
        code: 'ACCOUNT_ACTIVATION_INVALID_INPUT',
        message: '교직원 이름을 입력해 주세요.',
      });
    }

    const phoneFlowKey = this.phoneVerificationFlowKey(input.activationCode);
    await this.assertPhoneVerification({
      flowKey: phoneFlowKey,
      identityType: input.identityType,
      identityNumber: input.identityNumber,
      phone: input.phone,
      code: input.phoneVerificationCode,
    });
    const emailFlowKey = this.emailVerificationFlowKey(input.activationCode);
    await this.assertEmailVerification({
      flowKey: emailFlowKey,
      identityType: input.identityType,
      identityNumber: input.identityNumber,
      email: input.email,
      code: input.emailVerificationCode,
    });

    try {
      const result = await this.database.db.transaction(async (tx) => {
        const activeSchoolYear = await this.lockActiveSchoolYear(tx);
        const [activation] = await tx
          .select({
            id: schema.accountActivationCodes.id,
            codeHash: schema.accountActivationCodes.codeHash,
            attemptCount: schema.accountActivationCodes.attemptCount,
            usedAt: schema.accountActivationCodes.usedAt,
            schoolYear: schema.accountActivationCodes.schoolYear,
          })
          .from(schema.accountActivationCodes)
          .where(
            and(
              eq(schema.accountActivationCodes.identityType, input.identityType),
              eq(schema.accountActivationCodes.identityNumber, input.identityNumber),
            ),
          )
          .limit(1)
          .for('update');

        if (!activation || activation.usedAt) {
          throw new BadRequestException({
            code: 'ACCOUNT_ACTIVATION_CODE_INVALID',
            message: '인증코드를 확인해 주세요.',
          });
        }

        if (
          input.identityType === 'student' &&
          activation.schoolYear !== null &&
          activation.schoolYear !== activeSchoolYear
        ) {
          throw new BadRequestException({
            code: 'ACCOUNT_ACTIVATION_CODE_INVALID',
            message: '학년도가 변경된 인증코드입니다. 새 인증코드를 발급받아 주세요.',
          });
        }

        if (activation.attemptCount >= MAX_ACTIVATION_ATTEMPTS) {
          throw new BadRequestException({
            code: 'ACCOUNT_ACTIVATION_CODE_LOCKED',
            message: '인증코드를 다시 발급받아 주세요.',
          });
        }

        const expectedHash = this.hashCode(input, input.activationCode);
        if (!safeCompareHex(activation.codeHash, expectedHash)) {
          await tx
            .update(schema.accountActivationCodes)
            .set({
              attemptCount: activation.attemptCount + 1,
              updatedAt: new Date(),
            })
            .where(eq(schema.accountActivationCodes.id, activation.id));
          throw new BadRequestException({
            code: 'ACCOUNT_ACTIVATION_CODE_INVALID',
            message: '인증코드를 확인해 주세요.',
          });
        }

        const user = await this.ensureLocalIdentity(tx, input, activation.schoolYear);
        const existingSubject = await this.cognito.findUserSubject(String(input.identityNumber));
        if (existingSubject) {
          await this.assertCognitoLinkAllowed(tx, user.userId, existingSubject);
        }

        const cognitoUser = await this.cognito.createOrUpdatePermanentPasswordUser({
          username: String(input.identityNumber),
          password: input.password,
          email: input.email,
          name: user.name,
          ...(input.identityType === 'student' ? { studentNo: input.identityNumber } : {}),
        });
        await this.cognito.updateContactAttributes({
          subject: cognitoUser.subject,
          fallbackUsername: String(input.identityNumber),
          email: input.email,
          emailVerified: true,
          phone: input.phone,
        });
        await this.assertCognitoLinkAllowed(tx, user.userId, cognitoUser.subject);
        await tx
          .insert(schema.authAccounts)
          .values({
            userId: user.userId,
            provider: 'cognito',
            providerAccountId: cognitoUser.subject,
          })
          .onDuplicateKeyUpdate({
            set: {
              userId: user.userId,
              updatedAt: new Date(),
            },
          });

        await tx
          .update(schema.accountActivationCodes)
          .set({
            attemptCount: 0,
            usedAt: new Date(),
            usedById: user.userId,
            updatedAt: new Date(),
          })
          .where(eq(schema.accountActivationCodes.id, activation.id));

        return {
          userId: user.userId,
          identityType: user.identityType,
          identityNumber: user.identityNumber,
        };
      });

      await this.database.writeAudit({
        actorId: result.userId,
        action: 'auth.account-activation.complete',
        targetType: result.identityType,
        targetId: result.identityNumber,
      });

      await this.redis.delete(phoneFlowKey);
      await this.redis.delete(emailFlowKey);

      return { ok: true, ...result };
    } catch (error) {
      this.throwMappedCognitoError(error);
    }
  }

  private parseIdentity(body: unknown): ValidatedIdentity {
    const parsed = activationIdentitySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: 'ACCOUNT_ACTIVATION_INVALID_INPUT',
        message: '학번 또는 교사번호를 확인해 주세요.',
      });
    }

    return {
      ...parsed.data,
      identityNumber: this.validateIdentity(parsed.data),
    };
  }

  private async assertActiveEnrollment(input: ValidatedIdentity, tx = this.database.db) {
    if (input.identityType !== 'student' || input.schoolYear === undefined) return;
    const [enrollment] = await tx
      .select({ id: schema.studentEnrollments.id })
      .from(schema.studentEnrollments)
      .where(
        and(
          eq(schema.studentEnrollments.schoolYear, input.schoolYear),
          eq(schema.studentEnrollments.studentNo, input.identityNumber),
          eq(schema.studentEnrollments.status, 'active'),
        ),
      )
      .limit(1)
      .for('update');
    if (!enrollment) {
      throw new BadRequestException(
        '해당 학년도의 재학 명단에 등록된 학생만 인증코드를 발급할 수 있습니다.',
      );
    }
  }

  private async resolveActivationSchoolYear(schoolYear?: number) {
    const activeSchoolYear = await this.resolveActiveSchoolYear();
    if (schoolYear !== undefined && schoolYear !== activeSchoolYear) {
      throw new BadRequestException(
        '인증코드는 현재 활성 학년도의 재학생에게만 발급할 수 있습니다. 먼저 해당 학년도를 활성화해 주세요.',
      );
    }
    return activeSchoolYear;
  }

  private validateIdentity(input: ValidatedIdentity) {
    if (input.identityType === 'student')
      return deriveStudentNumberParts(input.identityNumber).studentNo;
    if (input.identityNumber < 100000 || input.identityNumber > 999999) {
      throw new BadRequestException({
        code: 'ACCOUNT_ACTIVATION_INVALID_INPUT',
        message: '교사번호는 6자리 숫자여야 합니다.',
      });
    }
    return input.identityNumber;
  }

  private hashCode(input: ValidatedIdentity, code: string) {
    return createHmac('sha256', env.CSRF_SECRET)
      .update(`${input.identityType}:${input.identityNumber}:${normalizeActivationCode(code)}`)
      .digest('hex');
  }

  private hashCodeLookup(code: string) {
    return createHmac('sha256', env.CSRF_SECRET)
      .update(`account-activation:${normalizeActivationCode(code)}`)
      .digest('hex');
  }

  private phoneVerificationFlowKey(activationCode: string) {
    return `auth:account-activation:phone:${this.hashCodeLookup(activationCode)}`;
  }

  private emailVerificationFlowKey(activationCode: string) {
    return `auth:account-activation:email:${this.hashCodeLookup(activationCode)}`;
  }

  private hashPhoneVerificationCode(flowKey: string, phone: string, code: string) {
    return this.hashVerificationCode(flowKey, phone, code);
  }

  private hashVerificationCode(flowKey: string, value: string, code: string) {
    return createHmac('sha256', env.CSRF_SECRET)
      .update(`${flowKey}:${value}:${code.trim()}`)
      .digest('hex');
  }

  private async findAvailableActivation(activationCode: string): Promise<ValidatedIdentity> {
    const lookupResults = await this.database.db
      .select({
        id: schema.accountActivationCodes.id,
        codeHash: schema.accountActivationCodes.codeHash,
        identityType: schema.accountActivationCodes.identityType,
        identityNumber: schema.accountActivationCodes.identityNumber,
        schoolYear: schema.accountActivationCodes.schoolYear,
        usedAt: schema.accountActivationCodes.usedAt,
        attemptCount: schema.accountActivationCodes.attemptCount,
      })
      .from(schema.accountActivationCodes)
      .where(eq(schema.accountActivationCodes.codeLookupHash, this.hashCodeLookup(activationCode)))
      .limit(1);
    let activation: (typeof lookupResults)[number] | undefined = lookupResults[0];

    if (!activation) {
      const legacyActivations = await this.database.db
        .select({
          id: schema.accountActivationCodes.id,
          codeHash: schema.accountActivationCodes.codeHash,
          identityType: schema.accountActivationCodes.identityType,
          identityNumber: schema.accountActivationCodes.identityNumber,
          schoolYear: schema.accountActivationCodes.schoolYear,
          usedAt: schema.accountActivationCodes.usedAt,
          attemptCount: schema.accountActivationCodes.attemptCount,
        })
        .from(schema.accountActivationCodes)
        .where(isNull(schema.accountActivationCodes.codeLookupHash));

      activation = legacyActivations.find((candidate) => {
        if (candidate.usedAt || candidate.attemptCount >= MAX_ACTIVATION_ATTEMPTS) return false;
        const expectedHash = this.hashCode(
          {
            identityType: candidate.identityType,
            identityNumber: candidate.identityNumber,
          },
          activationCode,
        );
        return safeCompareHex(candidate.codeHash, expectedHash);
      });

      if (activation) {
        await this.database.db
          .update(schema.accountActivationCodes)
          .set({ codeLookupHash: this.hashCodeLookup(activationCode), updatedAt: new Date() })
          .where(eq(schema.accountActivationCodes.id, activation.id));
      }
    }

    if (!activation || activation.usedAt || activation.attemptCount >= MAX_ACTIVATION_ATTEMPTS) {
      throw new BadRequestException({
        code: 'ACCOUNT_ACTIVATION_CODE_INVALID',
        message: '인증코드를 확인해 주세요.',
      });
    }
    return {
      identityType: activation.identityType,
      identityNumber: activation.identityNumber,
      schoolYear:
        activation.identityType === 'student'
          ? (activation.schoolYear ?? (await this.resolveActiveSchoolYear()))
          : undefined,
    };
  }

  private async assertPhoneVerification(input: {
    flowKey: string;
    identityType: AccountActivationIdentityType;
    identityNumber: number;
    phone: string;
    code: string;
  }) {
    const rawFlow = await this.redis.get(input.flowKey);
    const flowSchema = z.object({
      identityType: z.enum(['student', 'staff']),
      identityNumber: z.number().int().positive(),
      phone: z.string(),
      codeHash: z.string(),
      attemptCount: z.number().int().nonnegative(),
    });
    const decodedFlow: unknown = (() => {
      try {
        return rawFlow ? JSON.parse(rawFlow) : null;
      } catch {
        return null;
      }
    })();
    const flow = flowSchema.safeParse(decodedFlow);
    if (
      !flow?.success ||
      flow.data.identityType !== input.identityType ||
      flow.data.identityNumber !== input.identityNumber ||
      flow.data.phone !== input.phone
    ) {
      throw new BadRequestException({
        code: 'AUTH_CODE_EXPIRED',
        message: '전화번호 인증을 다시 진행해 주세요.',
      });
    }

    const expectedHash = this.hashPhoneVerificationCode(input.flowKey, input.phone, input.code);
    if (!safeCompareHex(flow.data.codeHash, expectedHash)) {
      const attemptCount = flow.data.attemptCount + 1;
      if (attemptCount >= 5) {
        await this.redis.delete(input.flowKey);
      } else {
        await this.redis.setJson(
          input.flowKey,
          { ...flow.data, attemptCount },
          PHONE_VERIFICATION_TTL_SECONDS,
        );
      }
      throw new BadRequestException({
        code: 'AUTH_CODE_MISMATCH',
        message: '전화번호 인증번호를 확인해 주세요.',
      });
    }
  }

  private async assertEmailVerification(input: {
    flowKey: string;
    identityType: AccountActivationIdentityType;
    identityNumber: number;
    email: string;
    code: string;
  }) {
    const rawFlow = await this.redis.get(input.flowKey);
    const flowSchema = z.object({
      identityType: z.enum(['student', 'staff']),
      identityNumber: z.number().int().positive(),
      email: z.string().email(),
      codeHash: z.string(),
      attemptCount: z.number().int().nonnegative(),
    });
    const decodedFlow: unknown = (() => {
      try {
        return rawFlow ? JSON.parse(rawFlow) : null;
      } catch {
        return null;
      }
    })();
    const flow = flowSchema.safeParse(decodedFlow);
    if (
      !flow.success ||
      flow.data.identityType !== input.identityType ||
      flow.data.identityNumber !== input.identityNumber ||
      flow.data.email !== input.email
    ) {
      throw new BadRequestException({
        code: 'AUTH_CODE_EXPIRED',
        message: '이메일 인증을 다시 진행해 주세요.',
      });
    }

    const expectedHash = this.hashVerificationCode(input.flowKey, input.email, input.code);
    if (!safeCompareHex(flow.data.codeHash, expectedHash)) {
      const attemptCount = flow.data.attemptCount + 1;
      if (attemptCount >= 5) {
        await this.redis.delete(input.flowKey);
      } else {
        await this.redis.setJson(
          input.flowKey,
          { ...flow.data, attemptCount },
          EMAIL_VERIFICATION_TTL_SECONDS,
        );
      }
      throw new BadRequestException({
        code: 'AUTH_CODE_MISMATCH',
        message: '이메일 인증번호를 확인해 주세요.',
      });
    }
  }

  private async ensureLocalIdentity(
    tx: AppTransaction,
    input: CompleteActivationInput,
    schoolYear: number | null | undefined,
  ): Promise<{
    userId: number;
    name: string;
    identityType: AccountActivationIdentityType;
    identityNumber: number;
  }> {
    if (input.identityType === 'student') {
      return this.ensureStudentIdentity(tx, input, schoolYear);
    }
    return this.ensureStaffIdentity(tx, input);
  }

  private async ensureStudentIdentity(
    tx: AppTransaction,
    input: CompleteActivationInput,
    targetSchoolYear: number | null | undefined,
  ) {
    const studentIdentity = deriveStudentNumberParts(input.identityNumber);
    const schoolYear = targetSchoolYear ?? (await this.getActiveSchoolYear(tx));
    const [student] = await tx
      .select({
        id: schema.studentEnrollments.studentId,
        userId: schema.students.userId,
        name: schema.students.name,
      })
      .from(schema.studentEnrollments)
      .innerJoin(schema.students, eq(schema.studentEnrollments.studentId, schema.students.id))
      .where(
        and(
          eq(schema.studentEnrollments.schoolYear, schoolYear),
          eq(schema.studentEnrollments.studentNo, studentIdentity.studentNo),
          eq(schema.studentEnrollments.status, 'active'),
        ),
      )
      .limit(1)
      .for('update');
    if (!student) {
      throw new BadRequestException({
        code: 'ACCOUNT_ACTIVATION_CODE_INVALID',
        message: '명단에 등록된 학생만 계정을 만들 수 있습니다.',
      });
    }
    const [existingUser] = await tx
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.studentNo, studentIdentity.studentNo))
      .limit(1);
    let userId = student?.userId ?? existingUser?.id;
    const userValues = {
      studentNo: studentIdentity.studentNo,
      name: student.name,
      grade: studentIdentity.grade,
      classNo: studentIdentity.classNo,
      number: studentIdentity.number,
      gender: toStoredStudentGender(input.gender),
      email: input.email,
      phone: input.phone,
      status: 'active' as const,
    };

    if (userId) {
      await tx
        .update(schema.users)
        .set({ ...userValues, updatedAt: new Date() })
        .where(eq(schema.users.id, userId));
    } else {
      const [user] = await tx
        .insert(schema.users)
        .values({ ...userValues, nickname: student.name })
        .$returningId();
      userId = user.id;
    }

    const studentId = student.id;
    await tx
      .update(schema.students)
      .set({
        userId,
        studentNo: studentIdentity.studentNo,
        name: student.name,
        grade: studentIdentity.grade,
        classNo: studentIdentity.classNo,
        number: studentIdentity.number,
        updatedAt: new Date(),
      })
      .where(eq(schema.students.id, studentId));

    await this.ensureRole(tx, userId, 'student');

    return {
      userId,
      name: student.name,
      identityType: input.identityType,
      identityNumber: studentIdentity.studentNo,
    };
  }

  private async ensureStaffIdentity(tx: AppTransaction, input: CompleteActivationInput) {
    const name = input.name ?? '';
    const [staff] = await tx
      .select({
        id: schema.staffProfiles.id,
        userId: schema.staffProfiles.userId,
      })
      .from(schema.staffProfiles)
      .where(eq(schema.staffProfiles.staffNo, input.identityNumber))
      .limit(1);
    let userId = staff?.userId;
    const userValues = {
      studentNo: null,
      name,
      gender: toStoredStudentGender(input.gender),
      email: input.email,
      phone: input.phone,
      status: 'active' as const,
    };

    if (userId) {
      await tx
        .update(schema.users)
        .set({ ...userValues, updatedAt: new Date() })
        .where(eq(schema.users.id, userId));
    } else {
      const [user] = await tx
        .insert(schema.users)
        .values({ ...userValues, nickname: name })
        .$returningId();
      userId = user.id;
    }

    if (staff) {
      await tx
        .update(schema.staffProfiles)
        .set({ userId, name, updatedAt: new Date() })
        .where(eq(schema.staffProfiles.id, staff.id));
    } else {
      await tx.insert(schema.staffProfiles).values({
        userId,
        staffNo: input.identityNumber,
        name,
        department: '',
        title: '',
      });
    }
    await this.ensureRole(tx, userId, 'teacher');

    return {
      userId,
      name,
      identityType: input.identityType,
      identityNumber: input.identityNumber,
    };
  }

  private async getActiveSchoolYear(tx: AppTransaction): Promise<number> {
    const [active] = await tx
      .select({ year: schema.schoolYears.year })
      .from(schema.schoolYears)
      .where(eq(schema.schoolYears.isActive, true))
      .orderBy(desc(schema.schoolYears.year))
      .limit(1);
    if (active) return active.year;

    const year = new Date().getFullYear();
    await tx
      .insert(schema.schoolYears)
      .values({ year, isActive: true })
      .onDuplicateKeyUpdate({
        set: { isActive: true, updatedAt: new Date() },
      });
    return year;
  }

  private async lockActiveSchoolYear(tx: AppTransaction, expectedYear?: number) {
    let activeRows = await tx
      .select({ year: schema.schoolYears.year })
      .from(schema.schoolYears)
      .where(eq(schema.schoolYears.isActive, true))
      .orderBy(desc(schema.schoolYears.year))
      .for('update');

    if (activeRows.length === 0) {
      await this.getActiveSchoolYear(tx);
      activeRows = await tx
        .select({ year: schema.schoolYears.year })
        .from(schema.schoolYears)
        .where(eq(schema.schoolYears.isActive, true))
        .orderBy(desc(schema.schoolYears.year))
        .for('update');
    }

    const activeYear = activeRows[0]?.year;
    if (!activeYear) {
      throw new ConflictException('활성 학년도를 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.');
    }
    if (expectedYear !== undefined && activeYear !== expectedYear) {
      throw new ConflictException(
        '학년도가 변경되었습니다. 현재 활성 학년도를 다시 선택해 주세요.',
      );
    }
    return activeYear;
  }

  private async resolveActiveSchoolYear(): Promise<number> {
    return this.database.db.transaction((tx) => this.getActiveSchoolYear(tx));
  }

  private async ensureRole(tx: AppTransaction, userId: number, roleName: string) {
    const [role] = await tx
      .select({ id: schema.roles.id })
      .from(schema.roles)
      .where(eq(schema.roles.name, roleName))
      .limit(1);
    if (!role) return;

    await tx
      .insert(schema.userRoles)
      .values({ userId, roleId: role.id })
      .onDuplicateKeyUpdate({ set: { userId } });
  }

  private async assertCognitoLinkAllowed(tx: AppTransaction, userId: number, subject: string) {
    const [subjectLink] = await tx
      .select({ userId: schema.authAccounts.userId })
      .from(schema.authAccounts)
      .where(
        and(
          eq(schema.authAccounts.provider, 'cognito'),
          eq(schema.authAccounts.providerAccountId, subject),
        ),
      )
      .limit(1);
    if (subjectLink && subjectLink.userId !== userId) {
      throw new ConflictException({
        code: 'ACCOUNT_ACTIVATION_LINK_CONFLICT',
        message: '이미 다른 계정과 연결된 통합로그인 계정입니다.',
      });
    }

    const existingLinks = await tx
      .select({ subject: schema.authAccounts.providerAccountId })
      .from(schema.authAccounts)
      .where(
        and(eq(schema.authAccounts.provider, 'cognito'), eq(schema.authAccounts.userId, userId)),
      )
      .limit(2);
    const conflictingLink = existingLinks.find((link) => link.subject && link.subject !== subject);
    if (conflictingLink || existingLinks.length > 1) {
      throw new ConflictException({
        code: 'ACCOUNT_ACTIVATION_LINK_CONFLICT',
        message: '이미 다른 통합로그인 계정이 연결되어 있습니다.',
      });
    }
  }

  private throwMappedCognitoError(error: unknown): never {
    if (!(error instanceof CognitoAuthError)) throw error;

    const payload = { code: error.code, message: error.message };
    switch (error.code) {
      case 'AUTH_INVALID_PASSWORD':
        throw new BadRequestException(payload);
      case 'AUTH_RATE_LIMITED':
        throw new HttpException(payload, HttpStatus.TOO_MANY_REQUESTS);
      default:
        throw new ServiceUnavailableException(payload);
    }
  }
}
