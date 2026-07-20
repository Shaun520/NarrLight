import { createClient as createSupabaseClient } from '@supabase/supabase-js';

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const hasValidServiceRoleKey =
    typeof serviceRoleKey === 'string' &&
    serviceRoleKey.startsWith('eyJ') &&
    ![...serviceRoleKey].some((char) => char.codePointAt(0)! > 127);

  if (!url || !hasValidServiceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is missing or invalid');
  }

  return createSupabaseClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
