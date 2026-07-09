/** Authentication API client for login, register, guest, and session endpoints. */
import { http } from './httpClient';
import type { AuthResponse, AuthUser, GuestAuthResponse, LoginRequest, RegisterRequest } from '@/types/auth';

export const authService = {
  login(data: LoginRequest): Promise<AuthResponse> {
    const identifier = data.identifier.trim();
    return http.post<AuthResponse>('/auth/login', {
      identifier,
      username: data.username ?? identifier,
      password: data.password,
    });
  },

  register(data: RegisterRequest): Promise<AuthResponse> {
    return http.post<AuthResponse>('/auth/register', data);
  },

  me(): Promise<AuthUser> {
    return http.get<AuthUser>('/auth/me');
  },

  guest(): Promise<GuestAuthResponse> {
    return http.post<GuestAuthResponse>('/auth/guest');
  },
};
