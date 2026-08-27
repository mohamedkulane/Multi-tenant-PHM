import { useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import "./thermal-paper.css";

export type ReceiptPaperWidth = 80 | 58;
export function receiptHeightMm(heightInPixels: number) {
  return Math.max(50, Math.ceil((heightInPixels * 25.4) / 96) + 2);
}
/** A real roll-paper width, with a page length measured from the rendered order. */
export function ThermalPaper({
  width,
  children,
}: {
  width: ReceiptPaperWidth;
  children: ReactNode;
}) {
  const pageName = "phmsReceipt" + useId().replace(/[^a-zA-Z0-9]/g, "");
  const paper = useRef<HTMLElement>(null);
  const [height, setHeight] = useState(180);
  useLayoutEffect(() => {
    const element = paper.current;
    if (!element) return;
    const measure = () => setHeight(receiptHeightMm(element.getBoundingClientRect().height));
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [width, children]);
  return (
    <>
      <style>{`@page ${pageName} { size: ${width}mm ${height}mm; margin: 0; }`}</style>
      <article
        ref={paper}
        className="clinical-print-sheet clinical-receipt-sheet lab-authorization-sheet thermal-receipt"
        style={{ width: `${width}mm`, page: pageName }}
        data-paper-width={width}
      >
        {children}
      </article>
    </>
  );
}
