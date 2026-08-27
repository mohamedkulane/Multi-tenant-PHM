import { useRef, useState, type ReactNode } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Droplets,
  Grid2X2,
  List,
  Package,
  Pill,
  Plus,
  ScanBarcode,
  Search,
  Syringe,
  FlaskConical,
} from "lucide-react";
import { money } from "./ui";

type Row = Record<string, unknown>;
const str = (value: unknown) =>
  typeof value === "string" || typeof value === "number" ? String(value) : "";
const packages = (product: Row) =>
  Array.isArray(product["packages"]) ? (product["packages"] as Row[]) : [];
export const categoryName = (value: unknown) => str(value).replaceAll("_", " ") || "Other";
export function CategoryIcon({ category }: { category: unknown }) {
  const value = str(category).toLowerCase();
  const Icon = /tablet|capsule/.test(value)
    ? Pill
    : /inject/.test(value)
      ? Syringe
      : /drop|cream/.test(value)
        ? Droplets
        : /syrup|liquid/.test(value)
          ? FlaskConical
          : Package;
  return <Icon size={16} aria-hidden="true" />;
}
export function sellableUnits(stock: Row[], productId: string, day: string) {
  return stock.reduce((sum, batch) => {
    const id = str(batch["productId"] ?? (batch["product"] as Row | undefined)?.["id"]);
    const expiry = str(batch["expiryDate"]).slice(0, 10);
    return id === productId && (!expiry || expiry >= day)
      ? sum + Math.max(0, Number(batch["quantityOnHand"]) || 0)
      : sum;
  }, 0);
}
export function CatalogPagination({
  page,
  count,
  pageSize,
  onChange,
  noun = "products",
}: {
  page: number;
  count: number;
  pageSize: number;
  onChange: (page: number) => void;
  noun?: string;
}) {
  const total = Math.max(1, Math.ceil(count / pageSize));
  return (
    <footer className="catalog-pagination">
      <span>
        Showing {count ? (page - 1) * pageSize + 1 : 0} to {Math.min(page * pageSize, count)} of{" "}
        {count} {noun}
      </span>
      <div>
        <button
          type="button"
          aria-label="Previous page"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
        >
          <ChevronLeft size={16} />
        </button>
        <span aria-current="page">
          {page} / {total}
        </span>
        <button
          type="button"
          aria-label="Next page"
          disabled={page >= total}
          onClick={() => onChange(page + 1)}
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </footer>
  );
}
function SearchControl({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="catalog-search">
      <Search size={17} aria-hidden="true" />
      <input
        ref={input}
        aria-label="Search products"
        placeholder="Search by name, SKU or barcode..."
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <button
        type="button"
        title="Focus search to use a barcode scanner"
        onClick={() => {
          input.current?.focus();
          input.current?.select();
        }}
      >
        <ScanBarcode size={17} /> Scan
      </button>
    </div>
  );
}
type CatalogProps = {
  products: Row[];
  currency: string;
  available: (id: string) => number | undefined;
};
export function ProductCatalog({
  products,
  currency,
  available,
  actions,
}: CatalogProps & { actions: (product: Row) => ReactNode }) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(1);
  const categories = [...new Set(products.map((product) => str(product["category"])))]
    .filter(Boolean)
    .sort();
  const filtered = products.filter(
    (product) =>
      (!category || product["category"] === category) &&
      [product["name"], product["sku"], product["barcode"], product["genericName"]].some((value) =>
        str(value).toLowerCase().includes(search.trim().toLowerCase()),
      ),
  );
  const current = Math.min(page, Math.max(1, Math.ceil(filtered.length / 6)));
  return (
    <section className="product-catalog">
      <div className="catalog-toolbar">
        <SearchControl
          value={search}
          onChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
        />
        <label className="catalog-category">
          <Grid2X2 size={16} />
          <select
            aria-label="Filter product category"
            value={category}
            onChange={(event) => {
              setCategory(event.target.value);
              setPage(1);
            }}
          >
            <option value="">All categories</option>
            {categories.map((item) => (
              <option key={item} value={item}>
                {categoryName(item)}
              </option>
            ))}
          </select>
        </label>
        <span className="catalog-count">{filtered.length} products</span>
      </div>
      <div className="catalog-table-scroll">
        <table className="catalog-table">
          <thead>
            <tr>
              {["Product", "Category", "Base unit", "Packages & prices", "Status", "Actions"].map(
                (label) => (
                  <th key={label}>{label}</th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {filtered.slice((current - 1) * 6, current * 6).map((product) => (
              <tr key={str(product["id"])}>
                <td>
                  <strong>{str(product["name"])}</strong>
                  <small>{str(product["sku"])}</small>
                  <span className="medicine-category" data-category={str(product["category"])}>
                    {categoryName(product["category"])}
                  </span>
                </td>
                <td>
                  <div className="catalog-category-cell">
                    <span>
                      <CategoryIcon category={product["category"]} />
                    </span>
                    {categoryName(product["category"])}
                  </div>
                </td>
                <td>{str(product["baseUnit"])}</td>
                <td>
                  <div className="catalog-packages">
                    {packages(product).map((pack) => {
                      const stock = available(str(product["id"]));
                      const count =
                        stock === undefined
                          ? undefined
                          : Number(pack["unitsPerPackage"]) > 0
                            ? Math.floor(stock / Number(pack["unitsPerPackage"]))
                            : 0;
                      return (
                        <div key={str(pack["code"])}>
                          <span>{str(pack["label"] ?? pack["code"])}</span>
                          <strong>
                            {pack["salePrice"] == null
                              ? "Not priced"
                              : money(pack["salePrice"], currency)}
                          </strong>
                          <small>
                            {count === undefined
                              ? "Stock unavailable"
                              : `${count.toLocaleString()} available`}
                          </small>
                        </div>
                      );
                    })}
                  </div>
                </td>
                <td>
                  <span
                    className={product["active"] === false ? "catalog-inactive" : "catalog-active"}
                  >
                    {product["active"] === false ? "INACTIVE" : "ACTIVE"}
                  </span>
                </td>
                <td>
                  <div className="catalog-actions">{actions(product)}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!filtered.length && (
        <p className="catalog-empty">No matching products. Try a different search or category.</p>
      )}
      <CatalogPagination page={current} count={filtered.length} pageSize={6} onChange={setPage} />
    </section>
  );
}
export function MedicineBrowser({
  products,
  currency,
  available,
  onChoose,
  onAdd,
}: CatalogProps & {
  onChoose: (product: Row, code?: string) => void;
  onAdd: (product: Row, pack: Row) => void;
}) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [view, setView] = useState<"list" | "grid">("list");
  const [page, setPage] = useState(1);
  const categories = [...new Set(products.map((product) => str(product["category"])))]
    .filter(Boolean)
    .sort();
  const filtered = products.filter(
    (product) =>
      product["active"] !== false &&
      (!category || product["category"] === category) &&
      [product["name"], product["sku"], product["barcode"], categoryName(product["category"])].some(
        (value) => str(value).toLowerCase().includes(search.trim().toLowerCase()),
      ),
  );
  const current = Math.min(page, Math.max(1, Math.ceil(filtered.length / 6)));
  return (
    <div className="medicine-browser">
      <header>
        <div>
          <p>Medicine browser</p>
          <h2>Select products</h2>
          <span>Search and select medicine to add to sale</span>
        </div>
        <div className="medicine-view">
          {(["list", "grid"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              aria-label={`${mode === "list" ? "List" : "Grid"} view`}
              aria-pressed={view === mode}
              onClick={() => setView(mode)}
            >
              {mode === "list" ? <List size={18} /> : <Grid2X2 size={18} />}
              {mode === "list" ? "List" : "Grid"}
            </button>
          ))}
        </div>
      </header>
      <SearchControl
        value={search}
        onChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
      />
      <div className="medicine-filters">
        <button
          type="button"
          aria-pressed={!category}
          onClick={() => {
            setCategory("");
            setPage(1);
          }}
        >
          All
        </button>
        {categories.map((item) => (
          <button
            type="button"
            key={item}
            aria-pressed={category === item}
            onClick={() => {
              setCategory(item);
              setPage(1);
            }}
          >
            <CategoryIcon category={item} />
            {categoryName(item)}
          </button>
        ))}
      </div>
      <div className={`medicine-items medicine-items-${view}`}>
        {filtered.slice((current - 1) * 6, current * 6).map((product) => {
          const stock = available(str(product["id"]));
          return (
            <article className="medicine-item" key={str(product["id"])}>
              <div className="medicine-identity">
                <button type="button" onClick={() => onChoose(product)}>
                  <h3>{str(product["name"])}</h3>
                </button>
                <span className="medicine-category" data-category={str(product["category"])}>
                  {categoryName(product["category"])}
                </span>
                <small>{str(product["sku"])}</small>
                <p>
                  {stock === undefined
                    ? "Stock unavailable"
                    : `${stock.toLocaleString()} sellable base units`}
                </p>
              </div>
              <div className="medicine-packages">
                {packages(product).map((pack) => {
                  const count =
                    stock !== undefined && Number(pack["unitsPerPackage"]) > 0
                      ? Math.floor(stock / Number(pack["unitsPerPackage"]))
                      : 0;
                  return (
                    <div key={str(pack["code"])}>
                      <button
                        type="button"
                        className="medicine-package-name"
                        onClick={() => onChoose(product, str(pack["code"]))}
                      >
                        {str(pack["label"] ?? pack["code"])}
                      </button>
                      <strong>
                        {pack["salePrice"] == null
                          ? "Not priced"
                          : money(pack["salePrice"], currency)}
                      </strong>
                      <span>{count} avail</span>
                      <button
                        className="medicine-add"
                        type="button"
                        aria-label={`Add ${str(product["name"])} ${str(pack["label"] ?? pack["code"])}`}
                        disabled={count < 1 || pack["salePrice"] == null}
                        onClick={() => onAdd(product, pack)}
                      >
                        <Plus size={17} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </article>
          );
        })}
      </div>
      {!filtered.length && <p className="catalog-empty">No matching products.</p>}
      <CatalogPagination page={current} count={filtered.length} pageSize={6} onChange={setPage} />
    </div>
  );
}
