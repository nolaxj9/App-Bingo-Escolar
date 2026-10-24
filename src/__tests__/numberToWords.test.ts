import { describe, expect, it } from 'vitest';
import { announcementText, numberToWords } from '../services/numberToWords';

describe('numberToWords', () => {
  it.each([
    [0, 'cero'], [1, 'uno'], [10, 'diez'], [15, 'quince'], [16, 'dieciséis'], [20, 'veinte'],
    [21, 'veintiuno'], [22, 'veintidós'], [23, 'veintitrés'], [26, 'veintiséis'], [30, 'treinta'],
    [31, 'treinta y uno'], [42, 'cuarenta y dos'], [55, 'cincuenta y cinco'], [90, 'noventa'],
    [99, 'noventa y nueve'], [100, 'cien'], [101, 'ciento uno'], [115, 'ciento quince'],
    [121, 'ciento veintiuno'], [200, 'doscientos'], [500, 'quinientos'], [999, 'novecientos noventa y nueve'],
  ])('%i → %s', (n, words) => {
    expect(numberToWords(n)).toBe(words);
  });
  it('fuera de 0..999 o no entero devuelve el número como texto', () => {
    expect(numberToWords(1000)).toBe('1000');
    expect(numberToWords(-1)).toBe('-1');
    expect(numberToWords(2.5)).toBe('2.5');
  });
  it('cubre 1..90 sin vacíos ni guiones', () => {
    for (let n = 1; n <= 90; n++) expect(numberToWords(n)).toMatch(/^[a-záéíóú]+( y [a-záéíóú]+)?$/);
  });
});

describe('announcementText', () => {
  it.each([
    [7, '¡Salió el número siete! El siete solo.'],
    [10, '¡Salió el número diez! Uno, cero.'],
    [36, '¡Salió el número treinta y seis! Tres, seis.'],
    [42, '¡Salió el número cuarenta y dos! Cuatro, dos.'],
    [90, '¡Salió el número noventa! Nueve, cero.'],
    [100, '¡Salió el número cien! Uno, cero, cero.'],
    [105, '¡Salió el número ciento cinco! Uno, cero, cinco.'],
  ])('%i con repetición', (n, text) => {
    expect(announcementText(n, true)).toBe(text);
  });
  it('sin repetición devuelve solo la frase original', () => {
    expect(announcementText(42, false)).toBe('¡Salió el número cuarenta y dos!');
    expect(announcementText(7, false)).toBe('¡Salió el número siete!');
  });
});
