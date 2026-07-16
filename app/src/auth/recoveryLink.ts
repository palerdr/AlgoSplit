/** Extract a Supabase recovery credential without accepting ordinary access-token links. */
export function recoveryTokenFromUrl(url: string | null): string | null {
  if (!url) return null;
  const hashIndex = url.indexOf('#');
  const queryIndex = url.indexOf('?');
  const hash = new URLSearchParams(hashIndex >= 0 ? url.slice(hashIndex + 1) : '');
  const query = new URLSearchParams(queryIndex >= 0 ? url.slice(queryIndex + 1) : '');
  const token = hash.get('access_token') ?? query.get('token') ?? query.get('access_token');
  const type = hash.get('type') ?? query.get('type');
  const resetPath = url.toLowerCase().includes('reset-password');
  return token && (type === 'recovery' || resetPath) ? token : null;
}
