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
  AccountActivationCompleteResult,
  AccountActivationIdentityType,
  AccountActivationIssueResult,
} from '@jshsus/types';
import { and, desc, eq } from 'drizzle-orm';
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

const ACTIVATION_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ACTIVATION_CODE_LENGTH = 12;
const MAX_ACTIVATION_ATTEMPTS = 10;

const activationIdentitySchema = z.object({
  identityType: z.enum(['student', 'staff']),
  identityNumber: z.coerce.number().int().positive(),
});

const genderSchema = z.preprocess(
  (value) => normalizeStudentGender(value) ?? value,
  z.enum(['male', 'female']),
);

const phoneSchema = z.preprocess((value) => normalizePhoneNumber(value) ?? value, z.string());

const completeActivationSchema = activationIdentitySchema.extend({
  activationCode: z.string().trim().min(6).max(32),
  name: z.string().trim().min(1).max(64),
  gender: genderSchema,
  email: z.string().trim().email().max(255),
  phone: phoneSchema.refine((value) => /^010\d{8}$/.test(value), {
    message: 'Phone number must start with 010.',
  }),
  password: z.string().min(8).max(256),
});

type CompleteActivationInput = z.infer<typeof completeActivationSchema>;
type AppTransaction = Parameters<Parameters<AppDatabase['transaction']>[0]>[0];
type ValidatedIdentity = {
  identityType: AccountActivationIdentityType;
  identityNumber: number;
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
  ) {}

  async issue(body: unknown, actorId?: number | null): Promise<AccountActivationIssueResult> {
    const input = this.parseIdentity(body);
    const code = generateActivationCode();

    await this.database.db
      .insert(schema.accountActivationCodes)
      .values({
        identityType: input.identityType,
        identityNumber: input.identityNumber,
        codeHash: this.hashCode(input, code),
        attemptCount: 0,
        issuedById: actorId && actorId > 0 ? actorId : null,
        usedById: null,
        usedAt: null,
      })
      .onDuplicateKeyUpdate({
        set: {
          codeHash: this.hashCode(input, code),
          attemptCount: 0,
          issuedById: actorId && actorId > 0 ? actorId : null,
          usedById: null,
          usedAt: null,
          updatedAt: new Date(),
        },
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
      code,
    };
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

    try {
      const result = await this.database.db.transaction(async (tx) => {
        const [activation] = await tx
          .select({
            id: schema.accountActivationCodes.id,
            codeHash: schema.accountActivationCodes.codeHash,
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

        if (!activation || activation.usedAt) {
          throw new BadRequestException({
            code: 'ACCOUNT_ACTIVATION_CODE_INVALID',
            message: '인증코드를 확인해 주세요.',
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

        const user = await this.ensureLocalIdentity(tx, input);
        const existingSubject = await this.cognito.findUserSubject(String(input.identityNumber));
        if (existingSubject) {
          await this.assertCognitoLinkAllowed(tx, user.userId, existingSubject);
        }

        const cognitoUser = await this.cognito.createOrUpdatePermanentPasswordUser({
          username: String(input.identityNumber),
          password: input.password,
          email: input.email,
          name: input.name,
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

        return user;
      });

      await this.database.writeAudit({
        actorId: result.userId,
        action: 'auth.account-activation.complete',
        targetType: result.identityType,
        targetId: result.identityNumber,
      });

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

  private async ensureLocalIdentity(
    tx: AppTransaction,
    input: CompleteActivationInput,
  ): Promise<{
    userId: number;
    identityType: AccountActivationIdentityType;
    identityNumber: number;
  }> {
    if (input.identityType === 'student') {
      return this.ensureStudentIdentity(tx, input);
    }
    return this.ensureStaffIdentity(tx, input);
  }

  private async ensureStudentIdentity(tx: AppTransaction, input: CompleteActivationInput) {
    const studentIdentity = deriveStudentNumberParts(input.identityNumber);
    const [student] = await tx
      .select({
        id: schema.students.id,
        userId: schema.students.userId,
      })
      .from(schema.students)
      .where(eq(schema.students.studentNo, studentIdentity.studentNo))
      .limit(1);
    const [existingUser] = await tx
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.studentNo, studentIdentity.studentNo))
      .limit(1);
    let userId = student?.userId ?? existingUser?.id;
    const userValues = {
      studentNo: studentIdentity.studentNo,
      name: input.name,
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
      const [user] = await tx.insert(schema.users).values(userValues).$returningId();
      userId = user.id;
    }

    let studentId = student?.id;
    if (studentId) {
      await tx
        .update(schema.students)
        .set({
          userId,
          studentNo: studentIdentity.studentNo,
          name: input.name,
          grade: studentIdentity.grade,
          classNo: studentIdentity.classNo,
          number: studentIdentity.number,
          updatedAt: new Date(),
        })
        .where(eq(schema.students.id, studentId));
    } else {
      const [createdStudent] = await tx
        .insert(schema.students)
        .values({
          userId,
          studentNo: studentIdentity.studentNo,
          name: input.name,
          grade: studentIdentity.grade,
          classNo: studentIdentity.classNo,
          number: studentIdentity.number,
        })
        .$returningId();
      studentId = createdStudent.id;
    }

    const schoolYear = await this.getActiveSchoolYear(tx);
    await tx
      .insert(schema.studentEnrollments)
      .values({
        studentId,
        schoolYear,
        studentNo: studentIdentity.studentNo,
        grade: studentIdentity.grade,
        classNo: studentIdentity.classNo,
        number: studentIdentity.number,
        status: 'active',
      })
      .onDuplicateKeyUpdate({
        set: {
          studentNo: studentIdentity.studentNo,
          grade: studentIdentity.grade,
          classNo: studentIdentity.classNo,
          number: studentIdentity.number,
          status: 'active',
          updatedAt: new Date(),
        },
      });
    await this.ensureRole(tx, userId, 'student');

    return {
      userId,
      identityType: input.identityType,
      identityNumber: studentIdentity.studentNo,
    };
  }

  private async ensureStaffIdentity(tx: AppTransaction, input: CompleteActivationInput) {
    const [staff] = await tx
      .select({
        id: schema.staffProfiles.id,
        userId: schema.staffProfiles.userId,
      })
      .from(schema.staffProfiles)
      .where(eq(schema.staffProfiles.staffNo, input.identityNumber))
      .limit(1);
    const [existingUser] = await tx
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.studentNo, -input.identityNumber))
      .limit(1);
    let userId = staff?.userId ?? existingUser?.id;
    const userValues = {
      studentNo: -input.identityNumber,
      name: input.name,
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
      const [user] = await tx.insert(schema.users).values(userValues).$returningId();
      userId = user.id;
    }

    if (staff) {
      await tx
        .update(schema.staffProfiles)
        .set({ userId, name: input.name, updatedAt: new Date() })
        .where(eq(schema.staffProfiles.id, staff.id));
    } else {
      await tx.insert(schema.staffProfiles).values({
        userId,
        staffNo: input.identityNumber,
        name: input.name,
        department: '',
        title: '',
      });
    }
    await this.ensureRole(tx, userId, 'teacher');

    return {
      userId,
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
