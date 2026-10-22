// Client-side guidance for US Person login usernames. Must accept exactly what
// server/_lib/supabaseAdmin.js validateUsername accepts after lowercase + trim.

export const USERNAME_PATTERN = /^[a-z0-9_]{3,40}$/;
export const USERNAME_EXAMPLE = 'michael_abate';

export function normalizeUsername(value) {
  return String(value ?? '').toLowerCase().trim();
}

export function usernameError(value) {
  const username = normalizeUsername(value);
  if (!username) return 'Enter a login username.';
  if (username.includes('@')) {
    return 'This is a username, not an email address. Remove the “@” and anything after it.';
  }
  if (/\s/.test(username)) return `Spaces are not allowed. Use an underscore instead, e.g. ${USERNAME_EXAMPLE}.`;
  if (username.length < 3) return 'Use at least 3 characters.';
  if (username.length > 40) return 'Use 40 characters or fewer.';
  if (!USERNAME_PATTERN.test(username)) {
    return 'Use only lowercase letters, numbers and underscores (no dots, dashes or symbols).';
  }
  return null;
}
