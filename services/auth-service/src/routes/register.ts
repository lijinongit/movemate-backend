import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { PrismaClient } from '@prisma/client';
import {
  userRegisterSchema,
  ValidationError,
  ConflictError,
  logger,
  hashPassword,
  validatePasswordStrength,
  generateOTP,
  hashOTP,
  getOTPExpiry,
  hashPII,
  createIndexHash,
  UserRegisterInput,
} from '@movemate/shared';
import { getSmsAdapter, getEmailAdapter } from '@movemate/shared/adapters';
import { config } from '../config';

const prisma = new PrismaClient();

interface RegisterResponse {
  data: {
    userId: string;
    email: string;
    status: string;
    underEighteen: boolean;
  };
  meta: {
    request_id: string;
    timestamp: string;
  };
}

export async function registerRegisterRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post<{ Body: UserRegisterInput }>(
    '/register',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const requestId = (request as any).requestId;
      const timestamp = new Date().toISOString();

      try {
        // Validate input
        const input = userRegisterSchema.parse(request.body);

        // Validate password strength
        const passwordValidation = validatePasswordStrength(input.password);
        if (!passwordValidation.isValid) {
          throw new ValidationError('Password does not meet strength requirements', {
            errors: passwordValidation.errors,
          });
        }

        // Check for duplicate email
        const existingUser = await prisma.user.findUnique({
          where: { email: input.email },
        });

        if (existingUser && !existingUser.deletedAt) {
          throw new ConflictError('Email already registered');
        }

        // Check if user is under 18
        const birthDate = new Date(input.dob);
        const today = new Date();
        const age = today.getFullYear() - birthDate.getFullYear();
        const isUnderEighteen = age < 18;

        // Hash password
        const passwordHash = await hashPassword(input.password);

        // Hash phone and email for indexing
        const phoneHash = createIndexHash(input.phone);

        // Create user
        const user = await prisma.user.create({
          data: {
            email: input.email,
            phone: input.phone, // Will be encrypted at DB level (RDS)
            phoneHash: phoneHash,
            firstName: input.firstName,
            lastName: input.lastName,
            dob: birthDate,
            role: 'customer',
            status: isUnderEighteen ? 'pending_parent_consent' : 'pending_email_verification',
            locale: input.locale,
            underEighteen: isUnderEighteen,
            passwordHash: passwordHash,
          },
        });

        // Create customer profile
        await prisma.customer.create({
          data: {
            userId: user.id,
          },
        });

        // Generate and send OTP
        const otpCode = generateOTP();
        const otpHash = hashOTP(otpCode);

        await prisma.otpRequest.create({
          data: {
            userId: user.id,
            email: input.email,
            code: otpHash,
            expiresAt: getOTPExpiry(),
          },
        });

        // Send OTP via email
        const emailAdapter = getEmailAdapter();
        await emailAdapter.sendOTP(input.email, otpCode);

        // Log registration
        logger.info(
          {
            requestId,
            userId: user.id,
            email_hash: hashPII(input.email),
            phone_hash: hashPII(input.phone),
            isUnderEighteen,
          },
          'User registered',
        );

        const response: RegisterResponse = {
          data: {
            userId: user.id,
            email: input.email,
            status: user.status,
            underEighteen: isUnderEighteen,
          },
          meta: {
            request_id: requestId,
            timestamp,
          },
        };

        return reply.status(201).send(response);
      } catch (err) {
        throw err;
      }
    },
  );
}
