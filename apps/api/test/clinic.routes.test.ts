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
    updateProfile: vi.fn(),
    changePassword: vi.fn(),
  };
}

describe("clinic workflow routes", () => {
  it("supports bounded reception history pages without changing the principal scope", async () => {
    const principal: AuthenticatedPrincipal = { ...basePrincipal, role: "RECEPTIONIST" };
    const clinic = new ClinicService();
    const visits = vi.spyOn(clinic, "visits").mockResolvedValue([] as never);
    const response = await request(createApp({ authentication: authentication(principal), clinic }))
      .get(`/api/v1/clinic/visits?branchId=${basePrincipal.branchIds[0]}&page=3`)
      .set("Cookie", "phms_session=test");
    expect(response.status).toBe(200);
    expect(visits).toHaveBeenCalledWith(principal, basePrincipal.branchIds[0], 3);
  });
  it.each(["-1", "1.5", "invalid", "10001"])("rejects invalid history page %s", async (page) => {
    const principal: AuthenticatedPrincipal = { ...basePrincipal, role: "RECEPTIONIST" };
    const clinic = new ClinicService();
    const visits = vi.spyOn(clinic, "visits");
    const response = await request(createApp({ authentication: authentication(principal), clinic }))
      .get(`/api/v1/clinic/visits?branchId=${basePrincipal.branchIds[0]}&page=${page}`)
      .set("Cookie", "phms_session=test");
    expect(response.status).toBe(400);
    expect(visits).not.toHaveBeenCalled();
  });
  it("loads a lightweight visit summary for the reception dashboard", async () => {
    const principal: AuthenticatedPrincipal = { ...basePrincipal, role: "RECEPTIONIST" };
    const clinic = new ClinicService();
    const visitSummaries = vi.spyOn(clinic, "visitSummaries").mockResolvedValue([
      {
        id: "10000000-0000-4000-8000-000000000006",
        visitNumber: "CLN-20260823-TEST",
        status: "WAITING_FOR_DOCTOR",
        patient: { name: "Test Patient" },
      },
    ] as never);

    const response = await request(createApp({ authentication: authentication(principal), clinic }))
      .get(`/api/v1/clinic/visits?branchId=${basePrincipal.branchIds[0]}&view=summary`)
      .set("Cookie", "phms_session=test");

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(visitSummaries).toHaveBeenCalledWith(principal, basePrincipal.branchIds[0]);
  });

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

  it.each(["EVC_PLUS", "E_DAHAB", "SALAAM_BANK"] as const)(
    "accepts consultation payment method %s",
    async (method) => {
      const principal: AuthenticatedPrincipal = { ...basePrincipal, role: "RECEPTIONIST" };
      const clinic = new ClinicService();
      const pay = vi
        .spyOn(clinic, "payConsultation")
        .mockResolvedValue({ id: "10000000-0000-4000-8000-000000000006" } as never);
      const response = await request(
        createApp({ authentication: authentication(principal), clinic }),
      )
        .post("/api/v1/clinic/visits/10000000-0000-4000-8000-000000000006/consultation-payment")
        .set("Cookie", "phms_session=test")
        .send({ method, idempotencyKey: `consultation:${method}` });

      expect(response.status).toBe(200);
      expect(pay).toHaveBeenCalledWith(
        principal,
        "10000000-0000-4000-8000-000000000006",
        expect.objectContaining({ method }),
        expect.any(String),
      );
    },
  );

  it("rejects a legacy consultation payment method", async () => {
    const principal: AuthenticatedPrincipal = { ...basePrincipal, role: "RECEPTIONIST" };
    const clinic = new ClinicService();
    const pay = vi.spyOn(clinic, "payConsultation");
    const response = await request(createApp({ authentication: authentication(principal), clinic }))
      .post("/api/v1/clinic/visits/10000000-0000-4000-8000-000000000006/consultation-payment")
      .set("Cookie", "phms_session=test")
      .send({ method: "CASH", idempotencyKey: "consultation:legacy" });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("UNSUPPORTED_PAYMENT_METHOD");
    expect(pay).not.toHaveBeenCalled();
  });

  it("keeps doctor-only clinical assessment writes away from reception", async () => {
    const principal: AuthenticatedPrincipal = { ...basePrincipal, role: "RECEPTIONIST" };
    const clinic = new ClinicService();
    const saveAssessment = vi.spyOn(clinic, "saveAssessment");

    const response = await request(createApp({ authentication: authentication(principal), clinic }))
      .put("/api/v1/clinic/visits/10000000-0000-4000-8000-000000000006/assessment")
      .set("Cookie", "phms_session=test")
      .send({ chiefComplaint: "Fever", testIds: [] });

    expect(response.status).toBe(403);
    expect(saveAssessment).not.toHaveBeenCalled();
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
      "/api/v1/clinic/visits/10000000-0000-4000-8000-000000000006/complete-review",
      {},
      "completeDoctorReview",
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
      const agent = request(createApp({ authentication: authentication(principal), clinic }));
      const pendingResponse = path.endsWith("complete-review") ? agent.post(path) : agent.put(path);
      const response = await pendingResponse.set("Cookie", "phms_session=test").send(body);

      expect(response.status).toBe(403);
      expect(serviceCall).not.toHaveBeenCalled();
    },
  );

  it("validates assessment, requested laboratory work, diagnosis, and doctor completion", async () => {
    const principal: AuthenticatedPrincipal = { ...basePrincipal, role: "DOCTOR" };
    const clinic = new ClinicService();
    const visit = { id: "10000000-0000-4000-8000-000000000006" } as never;
    const saveAssessment = vi.spyOn(clinic, "saveAssessment").mockResolvedValue(visit);
    const requestLabTests = vi.spyOn(clinic, "requestLabTests").mockResolvedValue(visit);
    const recordDiagnoses = vi.spyOn(clinic, "recordDiagnoses").mockResolvedValue(visit);
    const completeDoctorReview = vi.spyOn(clinic, "completeDoctorReview").mockResolvedValue(visit);
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
        medicationStatus: "UNKNOWN",
        allergyStatus: "UNKNOWN",
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
    const completed = await request(app)
      .post(`${visitPath}/complete-review`)
      .set("Cookie", "phms_session=test")
      .send({ disposition: "DISCHARGED", diagnosticOutcome: "FINAL_DIAGNOSIS" });

    expect([assessment.status, labOrder.status, diagnosis.status, completed.status]).toEqual([
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
    expect(completeDoctorReview).toHaveBeenCalledWith(
      principal,
      expect.any(String),
      expect.objectContaining({ disposition: "DISCHARGED" }),
      expect.any(String),
    );
  });

  it("supports a complete doctor review without laboratory tests", async () => {
    const principal: AuthenticatedPrincipal = { ...basePrincipal, role: "DOCTOR" };
    const clinic = new ClinicService();
    const completedVisit = {
      id: "10000000-0000-4000-8000-000000000006",
      status: "COMPLETED",
    } as never;
    const completeDoctorReview = vi
      .spyOn(clinic, "completeDoctorReview")
      .mockResolvedValue(completedVisit);

    const response = await request(createApp({ authentication: authentication(principal), clinic }))
      .post("/api/v1/clinic/visits/10000000-0000-4000-8000-000000000006/complete-review")
      .set("Cookie", "phms_session=test")
      .send({ disposition: "DISCHARGED", diagnosticOutcome: "FINAL_DIAGNOSIS" });

    expect(response.status).toBe(200);
    expect(completeDoctorReview).toHaveBeenCalledOnce();
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
      .send({
        samples: [
          {
            visitTestId: "40000000-0000-4000-8000-000000000001",
            sampleCondition: "ACCEPTABLE",
            sampleNotes: "EDTA tube",
          },
        ],
      });

    expect(response.status).toBe(200);
    expect(collectSample).toHaveBeenCalledWith(
      principal,
      "10000000-0000-4000-8000-000000000006",
      "30000000-0000-4000-8000-000000000001",
      {
        samples: [
          {
            visitTestId: "40000000-0000-4000-8000-000000000001",
            sampleCondition: "ACCEPTABLE",
            sampleNotes: "EDTA tube",
          },
        ],
      },
      expect.any(String),
    );
  });
});
