import { z } from 'zod';

// Email validation (RFC 5322 simplified)
export const emailSchema = z
  .string()
  .email('Invalid email format')
  .max(255, 'Email too long')
  .toLowerCase();

// UAE phone validation (E.164 format +971XXXXXXXXX)
export const phoneSchema = z
  .string()
  .regex(/^\+971\d{9}$/, 'Invalid UAE phone number (use +971XXXXXXXXX format)')
  .max(15);

// Password validation
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain at least 1 uppercase letter')
  .regex(/\d/, 'Password must contain at least 1 number')
  .regex(
    /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/,
    'Password must contain at least 1 special character',
  );

// Date of birth validation
export const dobSchema = z
  .coerce.date()
  .max(new Date(), 'DOB cannot be in the future')
  .refine((dob) => {
    const age = new Date().getFullYear() - dob.getFullYear();
    return age >= 0 && age <= 120;
  }, 'DOB invalid (age must be 0-120 years)');

// Common user schemas
export const userRegisterSchema = z.object({
  email: emailSchema,
  phone: phoneSchema,
  password: passwordSchema,
  firstName: z.string().min(2).max(50),
  lastName: z.string().min(2).max(50),
  dob: dobSchema,
  locale: z.enum(['en', 'ar']).optional().default('en'),
});

export const userLoginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
});

export const otpVerifySchema = z.object({
  userId: z.string().uuid(),
  code: z.string().length(6).regex(/^\d{6}$/, 'OTP must be 6 digits'),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});

export const trainerRegisterSchema = userRegisterSchema.extend({
  disciplines: z.array(z.string()).min(1),
  hourlyRateAed: z.number().int().min(50).max(500),
});

export const parentalConsentSchema = z.object({
  childId: z.string().uuid(),
  parentEmail: z.string().email(),
});

export const profileUpdateSchema = z.object({
  firstName: z.string().min(2).max(50).optional(),
  lastName: z.string().min(2).max(50).optional(),
  bio: z.string().max(500).optional(),
  locale: z.enum(['en', 'ar']).optional(),
});

export const trainerProfileUpdateSchema = profileUpdateSchema.extend({
  disciplines: z.array(z.string()).optional(),
  hourlyRateAed: z.number().int().min(50).max(500).optional(),
  bio: z.string().max(1000).optional(),
});

// Document schemas
export const documentTypeSchema = z.enum([
  'emirates_id',
  'dsc_cert_personal_training',
  'dsc_cert_dance',
  'dsc_cert_swimming',
  'dsc_cert_football',
  'dsc_cert_cricket',
  'dsc_cert_yoga',
  'intro_video',
  'profile_photo',
]);

export const documentVerifySchema = z.object({
  documentId: z.string().uuid(),
  status: z.enum(['verified', 'rejected']),
  rejectionReason: z.string().optional(),
});

export type UserRegisterInput = z.infer<typeof userRegisterSchema>;
export type UserLoginInput = z.infer<typeof userLoginSchema>;
export type OtpVerifyInput = z.infer<typeof otpVerifySchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
export type TrainerRegisterInput = z.infer<typeof trainerRegisterSchema>;
export type ParentalConsentInput = z.infer<typeof parentalConsentSchema>;
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;
export type TrainerProfileUpdateInput = z.infer<typeof trainerProfileUpdateSchema>;
export type DocumentVerifyInput = z.infer<typeof documentVerifySchema>;
