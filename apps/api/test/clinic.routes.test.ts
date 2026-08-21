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
    ["RECEPTIONIST", "/api/v1/clinic/visits/10000000-0000-4000-8000-000000000006/assessment", { chiefComplaint: "Fever" }, "saveAssessment"],
    ["LAB_TECHNICIAN", "/api/v1/clinic/visits/10000000-0000-4000-8000-000000000006/prescription", { items: [{ medicineName: "Drug", dosage: "1", frequency: "daily", duration: "5 days" }] }, "prescribe"],
    ["PHARMACIST", "/api/v1/clinic/visits/10000000-0000-4000-8000-000000000006/diagnoses/FINAL", { diagnoses: [{ description: "Malaria" }] }, "recordDiagnoses"],
  ] as const)(
    "blocks %s from unrelated clinical writes",
    async (role, path, body, serviceMethod) => {
      const principal: AuthenticatedPrincipal = { ...basePrincipal, role };
      const clinic = new ClinicService();
      const serviceCall = vi.spyOn(clinic, serviceMethod);
      const response = await request(createApp({ authentication: authentication(principal), clinic }))
        .put(path)
        .set("Cookie", "phms_session=test")
        .send(body);

      expect(response.status).toBe(403);
      expect(serviceCall).not.toHaveBeenCalled();
    },
  );});
