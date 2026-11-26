/** localStorage that never throws (private mode, blocked storage). */
export const lsGet = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

/** `null` removes the key. */
export const lsSet = (key: string, value: string | null): void => {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch { /* storage unavailable */ }
};
