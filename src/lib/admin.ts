// スーパー管理者のメールアドレス
const SUPER_ADMIN_EMAILS = ["tomura@hackjpn.com"];

export function isSuperAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  return SUPER_ADMIN_EMAILS.includes(email.toLowerCase());
}
