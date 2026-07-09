/**
 * Domain entity representing a system user.
 *
 * Contains profile data, password hash (never plain password), role,
 * and activation state. Framework-independent.
 */
import { UserRole } from './UserRole';

export interface User {
  id: string;
  username: string;
  name: string;
  surname: string;
  passwordHash: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
