/** "UsersApi" -> "users-api". Splits camelCase and non-alphanumerics. */
export function kebab(s: string): string {
  return s
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .toLowerCase();
}

/** "UsersApi" -> "usersApi". */
export function camel(s: string): string {
  const parts = s
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/);
  return parts
    .map((w, i) => (i === 0 ? w.charAt(0).toLowerCase() : w.charAt(0).toUpperCase()) + w.slice(1))
    .join("");
}

/** "users-api" -> "UsersApi". */
export function pascal(s: string): string {
  const c = camel(s);
  return c.charAt(0).toUpperCase() + c.slice(1);
}
