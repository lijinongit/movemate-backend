export interface UserBase {
  id: string;
  email: string;
  role: 'customer' | 'trainer' | 'studio_admin' | 'platform_admin';
  status: string;
  firstName: string;
  lastName: string;
  locale: 'en' | 'ar';
  underEighteen: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserProfile extends UserBase {
  phone?: string;
  dob?: Date;
}

export interface CustomerProfile extends UserProfile {
  activityPreferences?: string[];
  bio?: string;
  subscriptionStatus?: string;
}

export interface TrainerProfile extends UserProfile {
  status: 'pending_review' | 'approved' | 'suspended' | 'rejected';
  disciplines?: string[];
  hourlyRateAed?: number;
  bio?: string;
  introVideoUrl?: string;
  ratingAvg?: number;
  totalSessions: number;
  foundingTrainerBadge: boolean;
}
