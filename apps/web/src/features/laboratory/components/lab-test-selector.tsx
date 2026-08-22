import { Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { clinicalRows, clinicalText, type ClinicalRow } from "../../clinical/types/clinical-types";

export function LabTestSelector({
  categories,
  selected,
  onChange,
}: {
  categories: ClinicalRow[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const activeCategories = useMemo(
    () =>
      categories
        .filter((category) => category["active"] !== false)
        .map((category): ClinicalRow => ({
          ...category,
          tests: clinicalRows(category["tests"]).filter((test) => {
            if (test["active"] === false) return false;
            const haystack =
              `${clinicalText(test["code"], "")} ${clinicalText(test["name"], "")} ${clinicalText(category["name"], "")}`.toLowerCase();
            return haystack.includes(query.trim().toLowerCase());
          }),
        }))
        .filter((category) => clinicalRows(category["tests"]).length),
    [categories, query],
  );
  const allTests = categories.flatMap((category) => clinicalRows(category["tests"]));

  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id]);
  return (
    <div className="space-y-4">
      <label className="relative block">
        <Search className="absolute top-3 left-3 text-slate-400" size={18} />
        <input
          className="input w-full pl-10"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search test name, code, or category"
        />
      </label>
      {selected.length ? (
        <div className="flex flex-wrap gap-2" aria-label="Selected laboratory tests">
          {selected.map((id) => {
            const test = allTests.find((item) => clinicalText(item["id"], "") === id);
            return (
              <button
                key={id}
                type="button"
                onClick={() => toggle(id)}
                className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800 ring-1 ring-emerald-200"
              >
                {clinicalText(test?.["name"], id)} <X size={13} />
              </button>
            );
          })}
        </div>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-2">
        {activeCategories.map((category) => (
          <section
            key={clinicalText(category["id"])}
            className="rounded-xl border border-slate-200 p-4"
          >
            <h3 className="font-bold text-slate-900">{clinicalText(category["name"])}</h3>
            <div className="mt-3 grid gap-2">
              {clinicalRows(category["tests"]).map((test) => {
                const id = clinicalText(test["id"], "");
                return (
                  <label
                    key={id}
                    className="flex cursor-pointer items-start gap-3 rounded-lg p-2 hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      checked={selected.includes(id)}
                      onChange={() => toggle(id)}
                      className="mt-1 size-4 accent-emerald-700"
                    />
                    <span>
                      <strong className="block text-sm text-slate-800">
                        {clinicalText(test["name"])}
                      </strong>
                      <span className="text-xs text-slate-500">
                        {clinicalText(test["code"], "No code")} ·{" "}
                        {clinicalText(test["sampleType"], "Sample defined by laboratory")}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </section>
        ))}
      </div>
      {!activeCategories.length ? (
        <p className="rounded-xl bg-slate-50 p-5 text-center text-sm text-slate-500">
          No active laboratory test matches this search.
        </p>
      ) : null}
    </div>
  );
}
