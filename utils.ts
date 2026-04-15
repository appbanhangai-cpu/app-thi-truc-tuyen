
/**
 * Safely parses a JSON string.
 * @param str The JSON string to parse.
 * @param fallback The value to return if parsing fails.
 * @returns The parsed object or the fallback value.
 */
export function safeJsonParse<T = any>(str: string | null | undefined, fallback: T): T {
  if (!str || str === 'undefined' || str === 'null') return fallback;
  try {
    return JSON.parse(str);
  } catch (e) {
    console.error("JSON parse error:", e, "Content:", str);
    return fallback;
  }
}
