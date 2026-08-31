export interface UserProfile {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  isActive: boolean;
  isEmailVerified: boolean;
  mfaEnabled: boolean;
  roles: string[];
  createdAt: Date;
}
