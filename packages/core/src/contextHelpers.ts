/** Première valeur d’un param (URLSearchParams multi-valeurs → tableau). */
export function getQueryParamFirst(
  queryParams: Record<string, string | string[]> | undefined,
  name: string,
): string | undefined {
  if (!queryParams || !(name in queryParams)) return undefined;
  const v = queryParams[name];
  if (Array.isArray(v)) return v[0];
  return v;
}

export function safeRegexTest(pattern: string, against: string): boolean {
  try {
    return new RegExp(pattern).test(against);
  } catch {
    return false;
  }
}
