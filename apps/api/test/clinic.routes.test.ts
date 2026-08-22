import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import type { AuthService, AuthenticatedPrincipal } from "../src/auth/auth.types.js";
import { ClinicService } from "../src/clinic/clinic.service.js";

const basePrincipal = {
  sessionId: "10000000-0000-4000-8000-000000000001",
  tenantId: "10000000-0000-4000-8000-000000000002",
  tenantName: "Workflow Clinic",
  userId: "10000000-0000-4000-8000-000000000003",
  fullName: "Workflow User",
  membershipId: "10000000-0000-4000-8000-000000000004",
  username: "workflow-user",
  allBranches: false,
  branchIds: ["10000000-0000-4000-8000-000000000005"],
};

function authentication(principal: AuthenticatedPrincipal): AuthService {
  return {
    login: vi.fn(),
    authenticate: vi.fn().mockResolvedValue(principal),
    logout: vi.fn(),
  };
}

describe("clinic workflow routes", () => {
  it("allows reception to register a paid-gate clinic visit", async () => {
    const principal: AuthenticatedPrincipal = { ...basePrincipal, role: "RECEPTIONIST" };
    const clinic = new ClinicService();
    const register = vi.spyOn(clinic, "register").mockResolvedValue({
      id: "10000000-0000-4000-8000-000000000006",
      visitNumber: "CLN-20260821-TEST",
    } as never);

    const response = await request(createApp({ authentication: authentication(principal), clinic }))
      .post("/api/v1/clinic/visits")
      .set("Cookie", "phms_session=test")
      .send({
        branchId: basePrincipal.branchIds[0],
        patientId: "10000000-0000-4000-8000-000000000007",
        consultationFee: "15.00",
      });

    expect(response.status).toBe(201);
    expect(register).toHaveBeenCalledWith(
      principal,
      expect.objectContaining({ consultationFee: "15.00" }),
      expect.any(String),
    );
  });

  it("keeps doctor-only consultation writes away from reception", async () => {
    const principal: AuthenticatedPrincipal = { ...basePrincipal, role: "RECEPTIONIST" };
    const clinic = new ClinicService();
    const consult = vi.spyOn(clinic, "consult");

    const response = await request(createApp({ authentication: authentication(principal), clinic }))
      .put("/api/v1/clinic/visits/10000000-0000-4000-8000-000000000006/consultation")
      .set("Cookie", "phms_session=test")
      .send({ chiefComplaint: "Fever", testIds: [] });

    expect(response.status).toBe(403);
    expect(consult).not.toHaveBeenCalled();
  });

  it.each([
    [
      "RECEPTIONIST",
      "/api/v1/clinic/visits/10000000-0000-4000-8000-000000000006/assessment",
      { chiefComplaint: "Fever" },
      "saveAssessment",
    ],
    [
      "LAB_TECHNICIAN",
      "/api/v1/clinic/visits/10000000-0000-4000-8000-000000000006/prescription",
      { items: [{ medicineName: "Drug", dosage: "1", frequency: "daily", duration: "5 days" }] },
      "prescribe",
    ],
    [
      "PHARMACIST",
      "/api/v1/clinic/visits/10000000-0000-4000-8000-000000000006/diagnoses/FINAL",
      { diagnoses: [{ description: "Malaria" }] },
      "recordDiagnoses",
    ],
  ] as const)(
    "blocks %s from unrelated clinical writes",
    async (role, path, body, serviceMethod) => {
      const principal: AuthenticatedPrincipal = { ...basePrincipal, role };
      const clinic = new ClinicService();
      const serviceCall = vi.spyOn(clinic, serviceMethod);
      const response = await request(
        createApp({ authentication: authentication(principal), clinic }),
      )
        .put(path)
        .set("Cookie", "phms_session=test")
        .send(body);

      expect(response.status).toBe(403);
      expect(serviceCall).not.toHaveBeenCalled();
    },
  );

  it("validates the structured doctor workflow from assessment through prescription", async () => {
    const principal: AuthenticatedPrincipal = { ...basePrincipal, role: "DOCTOR" };
    const clinic = new ClinicService();
    const visit = { id: "10000000-0000-4000-8000-000000000006" } as never;
    const saveAssessment = vi.spyOn(clinic, "saveAssessment").mockResolvedValue(visit);
    const requestLabTests = vi.spyOn(clinic, "requestLabTests").mockResolvedValue(visit);
    const recordDiagnoses = vi.spyOn(clinic, "recordDiagnoses").mockResolvedValue(visit);
    const prescribe = vi.spyOn(clinic, "prescribe").mockResolvedValue(visit);
    const app = createApp({ authentication: authentication(principal), clinic });
    const visitPath = "/api/v1/clinic/visits/10000000-0000-4000-8000-000000000006";

    const assessment = await request(app)
      .put(`${visitPath}/assessment`)
      .set("Cookie", "phms_session=test")
      .send({
        chiefComplaint: "Fever and weakness for three days",
        symptoms: ["Fever", "Weakness"],
        vitalSigns: { temperature: 38.5, pulse: 96 },
        physicalExamination: { generalAppearance: "Unwell" },
        provisionalDiagnosis: "Suspected malaria",
      });
    const labOrder = await request(app)
      .post(`${visitPath}/lab-orders`)
      .set("Cookie", "phms_session=test")
      .send({
        testIds: ["20000000-0000-4000-8000-000000000001", "20000000-0000-4000-8000-000000000002"],
        priority: "URGENT",
        clinicalNotes: "Exclude malaria and anemia",
      });
    const diagnosis = await request(app)
      .put(`${visitPath}/diagnoses/FINAL`)
      .set("Cookie", "phms_session=test")
      .send({ diagnoses: [{ description: "Malaria" }, { description: "Mild dehydration" }] });
    const prescription = await request(app)
      .put(`${visitPath}/prescription`)
      .set("Cookie", "phms_session=test")
      .send({
        items: [
          {
            medicineName: "Artemether/Lumefantrine",
            strength: "20mg/120mg",
            dosage: "4 tablets",
            frequency: "Twice daily",
            duration: "3 days",
            route: "Oral",
            quantity: 24,
            instructions: "Take after meals",
          },
        ],
      });

    expect([assessment.status, labOrder.status, diagnosis.status, prescription.status]).toEqual([
      200, 201, 200, 200,
    ]);
    expect(saveAssessment).toHaveBeenCalledWith(
      principal,
      expect.any(String),
      expect.objectContaining({ chiefComplaint: expect.stringContaining("Fever") }),
      expect.any(String),
    );
    expect(requestLabTests).toHaveBeenCalledWith(
      principal,
      expect.any(String),
      expect.objectContaining({ testIds: expect.any(Array), priority: "URGENT" }),
      expect.any(String),
    );
    expect(recordDiagnoses).toHaveBeenCalledWith(
      principal,
      expect.any(String),
      "FINAL",
      expect.arrayContaining([expect.objectContaining({ description: "Malaria" })]),
      expect.any(String),
    );
    expect(prescribe).toHaveBeenCalledWith(
      principal,
      expect.any(String),
      expect.objectContaining({ items: expect.any(Array) }),
      expect.any(String),
    );
  });

  it("keeps consultation payment confirmation away from doctors", async () => {
    const principal: AuthenticatedPrincipal = { ...basePrincipal, role: "DOCTOR" };
    const clinic = new ClinicService();
    const pay = vi.spyOn(clinic, "payConsultation");
    const response = await request(createApp({ authentication: authentication(principal), clinic }))
      .post("/api/v1/clinic/visits/10000000-0000-4000-8000-000000000006/consultation-payment")
      .set("Cookie", "phms_session=test")
      .send({ method: "CASH", idempotencyKey: "doctor-cannot-pay" });

    expect(response.status).toBe(403);
    expect(pay).not.toHaveBeenCalled();
  });

  it("allows a lab technician to submit traceable sample details", async () => {
    const principal: AuthenticatedPrincipal = { ...basePrincipal, role: "LAB_TECHNICIAN" };
    const clinic = new ClinicService();
    const collectSample = vi
      .spyOn(clinic, "collectSample")
      .mockResolvedValue({ id: "visit" } as never);
    const response = await request(createApp({ authentication: authentication(principal), clinic }))
      .post(
        "/api/v1/clinic/visits/10000000-0000-4000-8000-000000000006/lab/30000000-0000-4000-8000-000000000001/sample",
      )
      .set("Cookie", "phms_session=test")
      .send({ sampleType: "Blood", sampleId: "SMP-2026-001", sampleNotes: "EDTA tube" });

    expect(response.status).toBe(200);
    expect(collectSample).toHaveBeenCalledWith(
      principal,
      "10000000-0000-4000-8000-000000000006",
      "30000000-0000-4000-8000-000000000001",
      { sampleType: "Blood", sampleId: "SMP-2026-001", sampleNotes: "EDTA tube" },
      expect.any(String),
    );
  });
});
