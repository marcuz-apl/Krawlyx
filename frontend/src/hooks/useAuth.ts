import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import { api, type LoginRequest, type UserOut } from '@/lib/api/client';

export const authKeys = {
  me: ['auth', 'me'] as const,
};

export function useMe() {
  return useQuery<UserOut | null>({
    queryKey: authKeys.me,
    queryFn: async () => {
      try {
        return await api.me();
      } catch {
        return null;
      }
    },
    retry: false,
    staleTime: 60_000,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: LoginRequest) => api.login(body),
    onSuccess: (data) => qc.setQueryData(authKeys.me, data.user),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: () => api.logout(),
    onSuccess: () => {
      qc.setQueryData(authKeys.me, null);
      qc.clear();
      navigate('/login', { replace: true });
    },
  });
}
