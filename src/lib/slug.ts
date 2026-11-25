import slugify from 'slugify'

/**
 * URL-safe slug from a name ("Salsa Con Ritmo" → "salsa-con-ritmo").
 * Strict mode strips punctuation instead of percent-encoding it.
 */
export function slugifyName(name: string): string {
  const slug = slugify(name, { lower: true, strict: true }).slice(0, 60)
  return slug || 'listing'
}

/**
 * Find a free slug by appending -2, -3, ... on collision. The `exists` check
 * is advisory — the unique constraint on the slug column is the real backstop,
 * so a P2002 from a concurrent create must still be handled by the caller.
 */
export async function generateUniqueSlug(
  base: string,
  exists: (slug: string) => Promise<boolean>,
): Promise<string> {
  const clean = slugifyName(base)
  let candidate = clean
  for (let n = 2; n <= 50; n++) {
    if (!(await exists(candidate))) return candidate
    candidate = `${clean}-${n}`
  }
  // 50 live collisions is pathological — add entropy instead of looping forever
  return `${clean}-${crypto.randomUUID().slice(0, 8)}`
}
