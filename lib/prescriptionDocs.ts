/**
 * Prescriptions written by Nura's doctors are saved into the patient's
 * Documents by the server (`period-buddy-be`'s
 * `utils/prescriptionDocumentStore.js`): a real PDF `MedicalDocument` with
 * `source: "consultation"`. Documents opens them in `PrescriptionViewer`
 * and gives them prescription actions instead of Delete. Pure, so it's
 * unit-tested in lib/__tests__/prescriptionDocs.test.ts.
 */
import type { MedicalDocument } from "./api";

/** The consultation a doctor's prescription document came from, or null for an upload. */
export function consultationIdOfDoc(doc: Pick<MedicalDocument, "source" | "consultationId">): string | null {
  return doc.source === "consultation" && doc.consultationId ? doc.consultationId : null;
}
