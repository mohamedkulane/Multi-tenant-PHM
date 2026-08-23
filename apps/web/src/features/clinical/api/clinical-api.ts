import { getData, sendData } from "../../../api/client";
import type { ClinicalRow } from "../types/clinical-types";

export const clinicalApi = {
  visit: (visitId: string) => getData<ClinicalRow>(`/clinic/visits/${visitId}`),
  patientHistory: (patientId: string) =>
    getData<ClinicalRow>(`/clinic/patients/${patientId}/history`),
  labCatalog: () => getData<ClinicalRow[]>("/lab/categories"),
  saveAssessment: (visitId: string, body: unknown) =>
    sendData<ClinicalRow>("put", `/clinic/visits/${visitId}/assessment`, body),
  requestLaboratory: (visitId: string, body: unknown) =>
    sendData<ClinicalRow>("post", `/clinic/visits/${visitId}/lab-orders`, body),
  saveFinalDiagnoses: (visitId: string, diagnoses: Array<{ description: string }>) =>
    sendData<ClinicalRow>("put", `/clinic/visits/${visitId}/diagnoses/FINAL`, { diagnoses }),
  completeDoctorReview: (visitId: string, input: Record<string, unknown>) =>
    sendData<ClinicalRow>("post", `/clinic/visits/${visitId}/complete-review`, input),
};
