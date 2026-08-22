export const clinicalKeys = {
  visit: (visitId: string) => ["clinical-visit", visitId] as const,
  history: (patientId: string) => ["clinical-history", patientId] as const,
  labCatalog: ["lab-categories"] as const,
};
