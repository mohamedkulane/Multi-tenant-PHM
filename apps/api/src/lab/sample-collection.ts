import { randomUUID } from "node:crypto";
import type { Prisma, SampleCondition } from "@prisma/client";
import type { AuthenticatedPrincipal } from "../auth/auth.types.js";
import { AppError } from "../errors/app-error.js";
import { parseMoney } from "../finance/money.js";
import { canAccessBranch } from "../middleware/authorization.js";

export interface SampleCollectionInput {
  samples: Array<{
    visitTestId: string;
    sampleCondition: SampleCondition;
    rejectionReason?: string | undefined;
    sampleNotes?: string | undefined;
  }>;
}

function clean(value: string | undefined) {
  return value?.trim() || null;
}

export async function collectLabVisitSamples(
  transaction: Prisma.TransactionClient,
  principal: AuthenticatedPrincipal,
  labVisitId: string,
  input: SampleCollectionInput,
  options: { expectedClinicVisitId?: string; requestId?: string } = {},
) {
  const lab = await transaction.labVisit.findUnique({
    where: { tenantId_id: { tenantId: principal.tenantId, id: labVisitId } },
    include: { tests: true },
  });
  if (
    !lab ||
    (options.expectedClinicVisitId !== undefined &&
      lab.clinicVisitId !== options.expectedClinicVisitId) ||
    !canAccessBranch(principal, lab.branchId)
  ) {
    throw new AppError({
      statusCode: 404,
      code: "LAB_VISIT_NOT_FOUND",
      message: "Lab order not found",
    });
  }
  if (parseMoney(lab.amountPaid.toString()) < parseMoney(lab.total.toString())) {
    throw new AppError({
      statusCode: 409,
      code: "LAB_PAYMENT_REQUIRED",
      message: "Lab fee must be paid in full before collecting the sample",
    });
  }
  if (lab.sampleStatus === "COLLECTED") {
    throw new AppError({
      statusCode: 409,
      code: "LAB_SAMPLE_ALREADY_COLLECTED",
      message: "Samples for this lab order have already been collected",
    });
  }

  const uniqueSamples = new Map(input.samples.map((sample) => [sample.visitTestId, sample]));
  if (
    uniqueSamples.size !== lab.tests.length ||
    lab.tests.some((test) => !uniqueSamples.has(test.id))
  ) {
    throw new AppError({
      statusCode: 400,
      code: "ALL_LAB_SAMPLES_REQUIRED",
      message: "Record sample details for every ordered laboratory test",
    });
  }

  const hasRejected = input.samples.some((sample) => sample.sampleCondition !== "ACCEPTABLE");
  await Promise.all(
    lab.tests.map((test) => {
      const sample = uniqueSamples.get(test.id)!;
      const accepted = sample.sampleCondition === "ACCEPTABLE";
      return transaction.labVisitTest.update({
        where: { tenantId_id: { tenantId: principal.tenantId, id: test.id } },
        data: {
          sampleId: accepted ? `SMP-${randomUUID().slice(0, 8).toUpperCase()}` : null,
          sampleStatus: accepted ? "COLLECTED" : "RECOLLECTION_REQUIRED",
          sampleCondition: sample.sampleCondition,
          rejectionReason: accepted ? null : (clean(sample.rejectionReason) ?? "Sample rejected"),
          sampleNotes: clean(sample.sampleNotes),
          sampleCollectedAt: accepted ? new Date() : null,
          sampleCollectedById: principal.membershipId,
        },
      });
    }),
  );

  await transaction.labVisit.update({
    where: { tenantId_id: { tenantId: principal.tenantId, id: labVisitId } },
    data: {
      sampleStatus: hasRejected ? "RECOLLECTION_REQUIRED" : "COLLECTED",
      sampleCollectedAt: hasRejected ? null : new Date(),
      sampleCollectedById: principal.membershipId,
      sampleId: null,
      sampleNotes: null,
      status: hasRejected ? "REGISTERED" : "RESULTS_PENDING",
    },
  });

  if (lab.clinicVisitId) {
    await transaction.clinicVisit.update({
      where: { tenantId_id: { tenantId: principal.tenantId, id: lab.clinicVisitId } },
      data: { status: hasRejected ? "WAITING_FOR_SAMPLE" : "LAB_IN_PROGRESS" },
    });
  }

  await transaction.auditLog.create({
    data: {
      tenantId: principal.tenantId,
      branchId: lab.branchId,
      actorUserId: principal.userId,
      actorMembershipId: principal.membershipId,
      ...(options.requestId ? { requestId: options.requestId } : {}),
      action: hasRejected ? "LAB_SAMPLE_REJECTED" : "LAB_SAMPLE_COLLECTED",
      entityType: "lab_visit",
      entityId: labVisitId,
      metadata: { sampleCount: uniqueSamples.size, recollectionRequired: hasRejected },
    },
  });

  return { clinicVisitId: lab.clinicVisitId, hasRejected };
}
