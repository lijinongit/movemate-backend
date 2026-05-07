export interface JwtPayload {
  userId: string;
  email: string;
  role: 'customer' | 'trainer' | 'studio_admin' | 'platform_admin';
  iat: number;
  exp: number;
}

export interface JwtToken {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}
