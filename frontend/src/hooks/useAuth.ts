import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, type LoginRequest, type UserOut } from '@/lib/api/client';

export const authKeys = {
  me: ['auth', 'me'] as const,
};

export function useMe() {
  return useQuery<UserOut>({
    queryKey: authKeys.me,
    queryFn: () => api.me(),
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
  return useMutation({
    mutationFn: () => api.logout(),
    onSuccess: () => qc.removeQueries({ queryKey: authKeys.me }),
  });
}
