import {
  type DevelopmentEvidenceBundle,
  type DevelopmentEvidenceDiagnosticCode,
  verifyDevelopmentEvidenceDsl,
} from "../dsl/development-evidence.js";

export interface DevelopmentEvidenceIntake {
  schema: "subactor.development-evidence-intake/v1";
  status: "accepted" | "incomplete" | "rejected" | "invalid";
  observationEligible: boolean;
  findingCode: DevelopmentEvidenceDiagnosticCode | "DEVELOPMENT_EVIDENCE_NOT_ACCEPTED" | null;
  evidence: DevelopmentEvidenceBundle | null;
  ssotPromotionVerified: false;
  mutationAuthorized: false;
}

/**
 * Convert a verified cross-project bundle into read-only Twin intake state.
 * Promotion and mutation require separate onlyDSL receipts and are deliberately
 * impossible to assert through this API.
 */
export function intakeDevelopmentEvidence(markdown: string): DevelopmentEvidenceIntake {
  const verification = verifyDevelopmentEvidenceDsl(markdown);
  if (!verification.ok || !verification.bundle) {
    return {
      schema: "subactor.development-evidence-intake/v1",
      status: "invalid",
      observationEligible: false,
      findingCode: verification.code === "PASS" ? "DEVELOPMENT_EVIDENCE_FIELD_INVALID" : verification.code,
      evidence: null,
      ssotPromotionVerified: false,
      mutationAuthorized: false,
    };
  }
  const accepted = verification.bundle.assessment === "accepted";
  return {
    schema: "subactor.development-evidence-intake/v1",
    status: verification.bundle.assessment,
    observationEligible: accepted,
    findingCode: accepted ? null : "DEVELOPMENT_EVIDENCE_NOT_ACCEPTED",
    evidence: verification.bundle,
    ssotPromotionVerified: false,
    mutationAuthorized: false,
  };
}
