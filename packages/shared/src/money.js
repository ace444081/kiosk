/**
 * Money helpers. All stored money is integer centavos.
 */

const pesoFormatter = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
});

const pesoFormatterNoDecimals = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export function formatPeso(centavos) {
  if (!Number.isInteger(centavos)) {
    throw new TypeError('formatPeso expects an integer amount in centavos');
  }
  return pesoFormatter.format(centavos / 100);
}

export function formatPesoNoDecimals(centavos) {
  return pesoFormatterNoDecimals.format(centavos / 100);
}

export function multiplyCentavos(centavos, quantity) {
  return centavos * quantity;
}

export function sumCentavos(values) {
  return values.reduce((sum, v) => sum + v, 0);
}
