const UNIDADES = [
  'cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez',
  'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve',
  'veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis',
  'veintisiete', 'veintiocho', 'veintinueve',
];
const DECENAS = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
const CENTENAS = [
  '', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos',
  'seiscientos', 'setecientos', 'ochocientos', 'novecientos',
];

/** Número entero 0..999 en palabras, en español ("cuarenta y dos", "ciento uno"). */
export function numberToWords(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 999) return String(n);
  if (n < 30) return UNIDADES[n];
  if (n < 100) {
    const u = n % 10;
    return u === 0 ? DECENAS[n / 10] : `${DECENAS[Math.floor(n / 10)]} y ${UNIDADES[u]}`;
  }
  if (n === 100) return 'cien';
  const resto = n % 100;
  return resto === 0 ? CENTENAS[n / 100] : `${CENTENAS[Math.floor(n / 100)]} ${numberToWords(resto)}`;
}

/**
 * Texto que se lee al salir un número. Con `repeatDigits` lo repite cifra por cifra, como el cantor de bingo:
 * "¡Salió el número treinta y seis! Tres, seis." / "¡Salió el número siete! El siete solo."
 */
export function announcementText(n: number, repeatDigits: boolean): string {
  const base = `¡Salió el número ${numberToWords(n)}!`;
  if (!repeatDigits || !Number.isInteger(n) || n < 0 || n > 999) return base;
  if (n < 10) return `${base} El ${numberToWords(n)} solo.`;
  const digits = String(n).split('').map((d) => numberToWords(Number(d))).join(', ');
  return `${base} ${digits.charAt(0).toUpperCase()}${digits.slice(1)}.`;
}
