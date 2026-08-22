const STORAGE_KEY = "synkai-user-name";

export function loadUserName(): string {
  try {
    return localStorage.getItem(STORAGE_KEY)?.trim() ?? "";
  } catch {
    return "";
  }
}

export function saveUserName(name: string) {
  try {
    localStorage.setItem(STORAGE_KEY, name.trim());
  } catch {
    // ignore quota / private mode
  }
}

export function colorForUser(creatorId: string): string {
  let hash = 0;
  for (let i = 0; i < creatorId.length; i += 1) {
    hash = (hash * 31 + creatorId.charCodeAt(i)) | 0;
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} 60% 42%)`;
}
