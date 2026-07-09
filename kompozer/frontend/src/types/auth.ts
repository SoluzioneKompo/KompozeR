/** Authentication request and response contracts shared across frontend modules. */
export interface LoginRequest {
  identifier: string;
  username?: string;
  password: string;
}

export interface RegisterRequest {
  username: string;
  name: string;
  surname: string;
  email: string;
  password: string;
}

export interface AuthUser {
  id: string;
  username: string;
  name?: string;
  surname?: string;
  email?: string;
  role: 'BASE' | 'ADMIN' | 'GUEST';
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

export interface GuestAuthResponse {
  token: string;
}
