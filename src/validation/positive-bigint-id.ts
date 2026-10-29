const MAX_POSTGRES_BIGINT = 9_223_372_036_854_775_807n;
const POSITIVE_INTEGER_PATTERN = /^[1-9]\d*$/;

export function parsePositiveBigIntId(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  // Максимальный BIGINT содержит 19 цифр.
  // Проверяем длину до BigInt(), чтобы не преобразовывать огромные строки.
  if (value.length === 0 || value.length > 19) {
    return null;
  }

  if (!POSITIVE_INTEGER_PATTERN.test(value)) {
    return null;
  }

  if (BigInt(value) > MAX_POSTGRES_BIGINT) {
    return null;
  }

  return value;
}
