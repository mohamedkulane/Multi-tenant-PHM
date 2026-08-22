export type ClinicalSection =
  "overview" | "assessment" | "examination" | "laboratory" | "results" | "diagnosis" | "summary";

const sections: Array<[ClinicalSection, string]> = [
  ["overview", "Overview"],
  ["assessment", "Assessment"],
  ["examination", "Examination"],
  ["laboratory", "Laboratory"],
  ["results", "Lab Results"],
  ["diagnosis", "Diagnosis"],
  ["summary", "Summary"],
];

export function ClinicalNavigation({
  value,
  onChange,
}: {
  value: ClinicalSection;
  onChange: (value: ClinicalSection) => void;
}) {
  return (
    <nav className="clinical-tabs" aria-label="Clinical visit sections">
      {sections.map(([section, label]) => (
        <button
          key={section}
          type="button"
          className={section === value ? "is-active" : ""}
          onClick={() => onChange(section)}
        >
          {label}
        </button>
      ))}
    </nav>
  );
}
