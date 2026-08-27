/** Aggregate stock requirements across differently customized cart lines. */
export function aggregateStockRequirements(items) {
  const quantities = new Map();
  for (const item of items) {
    quantities.set(item.productId, (quantities.get(item.productId) || 0) + item.quantity);
  }
  return [...quantities]
    .map(([productId, quantity]) => ({ productId, quantity }))
    .sort((left, right) => left.productId.localeCompare(right.productId));
}

/** Attach a stable stock error to every cart line for the depleted product. */
export function addStockFieldErrors(fieldErrors, inputItems, productId) {
  inputItems.forEach((item, index) => {
    if (item.productId === productId) {
      fieldErrors[`items.${index}.quantity`] = 'INSUFFICIENT_STOCK';
    }
  });
}
