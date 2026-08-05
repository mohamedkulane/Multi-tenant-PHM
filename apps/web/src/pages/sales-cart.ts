export type SaleCartLine = {
  productId: string;
  productName: string;
  packageCode: string;
  packageLabel: string;
  packageQuantity: number;
  unitPrice: number;
  unitsPerPackage: string;
};

export function appendSaleCartLine(cart: SaleCartLine[], line: SaleCartLine) {
  const existing = cart.find(
    (item) => item.productId === line.productId && item.packageCode === line.packageCode,
  );

  if (existing) {
    return cart.map((item) =>
      item.productId === line.productId && item.packageCode === line.packageCode
        ? { ...item, packageQuantity: item.packageQuantity + line.packageQuantity }
        : item,
    );
  }

  return [...cart, line];
}

export function calculateSaleCartTotals(
  cart: SaleCartLine[],
  discountValue: string | number,
  amountPaidValue: string | number,
) {
  const subtotal = cart.reduce((total, item) => total + item.unitPrice * item.packageQuantity, 0);
  const requestedDiscount = Number(discountValue) || 0;
  const discount = Math.min(subtotal, Math.max(0, requestedDiscount));
  const grandTotal = Math.max(0, subtotal - discount);
  const amountPaid = Math.max(0, Number(amountPaidValue) || 0);

  return {
    subtotal,
    discount,
    grandTotal,
    balanceDue: Math.max(0, grandTotal - amountPaid),
    changeDue: Math.max(0, amountPaid - grandTotal),
  };
}
