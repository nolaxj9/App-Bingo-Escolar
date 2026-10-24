/** Formatos compartidos por la app y el panel de administración (es-AR). */

/** `05/03/2026` */
export function formatearFecha(ms: number): string {
  return new Date(ms).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** `$ 5.000` */
export function formatearPesos(monto: number): string {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(monto);
}

/** Solo los dígitos de un teléfono (`+54 9 11 5555-1234` → `5491155551234`). */
export function soloDigitos(texto: string): string {
  return texto.replace(/\D/g, '');
}

/** Link de WhatsApp. Sin número válido abre WhatsApp para elegir el contacto. */
export function linkWhatsApp(numero: string | null | undefined, texto: string): string {
  let digitos = numero ? soloDigitos(numero).replace(/^0+/, '') : '';
  // Celular argentino cargado sin código de país (11 5555 1234): WhatsApp necesita 549 adelante.
  if (digitos.length === 10) digitos = `549${digitos}`;
  const base = digitos.length >= 8 && digitos.length <= 15 ? `https://wa.me/${digitos}` : 'https://wa.me/';
  return `${base}?text=${encodeURIComponent(texto)}`;
}

/** Si el contacto parece un teléfono (solo dígitos, +, espacios, guiones, paréntesis) devuelve sus dígitos; si no, null. */
export function telefonoDeContacto(contacto: string): string | null {
  const t = contacto.trim();
  if (!/^[\d\s+\-().]+$/.test(t)) return null;
  const d = soloDigitos(t);
  return d.length >= 8 && d.length <= 15 ? d : null;
}
