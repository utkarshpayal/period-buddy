import { apiRequest, type Pagination, type QueryValue, toQuery } from "./client";

export type SchemeCategory =
  | "menstrual_hygiene"
  | "adolescent_health"
  | "sexual_reproductive_health"
  | "family_planning"
  | "pregnancy_antenatal"
  | "maternity_postpartum"
  | "mother_newborn_care"
  | "maternal_nutrition"
  | "reproductive_health";

export type GovernmentLevel = "central" | "state";

// A benefit's primary call-to-action — not everything is an "apply" flow.
export type SchemeActionType =
  | "APPLY"
  | "CHECK_ELIGIBILITY"
  | "FIND_FACILITY"
  | "LEARN_MORE"
  | "EXTERNAL_APPLICATION";

export type SchemeType = "scheme" | "programme" | "service" | "entitlement";

export type SchemeEligibilityRule = {
  text: string;
  field?: string;
  operator?: "eq" | "neq" | "gte" | "lte" | "in" | "exists";
  value?: unknown;
};

export type SchemeApplicationStep = { title: string; detail?: string };

export type GovernmentBenefit = {
  _id: string;
  name: string;
  slug: string;
  shortName?: string;
  type: SchemeType;
  governmentLevel: GovernmentLevel;
  state?: string | null;
  categories: SchemeCategory[];
  description: string;
  benefits: string[];
  eligibility: SchemeEligibilityRule[];
  documents: string[];
  actionType: SchemeActionType;
  applicationMethod?: string;
  applicationSteps?: SchemeApplicationStep[];
  whereToGet?: string;
  officialUrl?: string;
  source?: string;
  helpline?: string;
  lastVerifiedAt?: string;
  isActive: boolean;
};

export type SchemeCategoryMeta = {
  key: SchemeCategory;
  label: string;
  icon: string;
};

export type SchemeEligibilityResult = {
  schemeId: string;
  actionType: SchemeActionType;
  status: "may_be_eligible" | "not_eligible";
  message: string;
  criteria: { text: string; result: "pass" | "fail" | "unknown" }[];
  unmetCriteria: string[];
};

export type SchemeApplicationStatus =
  | "draft"
  | "submitted"
  | "in_review"
  | "approved"
  | "rejected"
  | "withdrawn";

export type SchemeApplicationDocument = { name?: string; url?: string };

export type SchemeApplicationUser = {
  _id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
};

export type SchemeApplication = {
  _id: string;
  // A string id normally; populated with basic user fields on admin endpoints.
  userId: string | SchemeApplicationUser;
  reviewNote?: string;
  reviewedAt?: string;
  schemeId:
    | string
    | Pick<
        GovernmentBenefit,
        | "_id"
        | "name"
        | "shortName"
        | "slug"
        | "actionType"
        | "governmentLevel"
        | "state"
        | "officialUrl"
      >;
  schemeName?: string;
  formData?: Record<string, unknown>;
  documents?: SchemeApplicationDocument[];
  status: SchemeApplicationStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

export type SchemeListParams = {
  search?: string;
  category?: SchemeCategory | string;
  state?: string;
  governmentLevel?: GovernmentLevel;
  page?: number;
  limit?: number;
};

export type SchemeEligibilityAnswers = {
  gender?: string;
  age?: number;
  state?: string;
  isPregnant?: boolean;
  hasChildren?: boolean;
};

export const schemesApi = {
  list: (params?: SchemeListParams) =>
    apiRequest<{ schemes: GovernmentBenefit[]; pagination: Pagination }>(
      `/api/schemes${toQuery(params as Record<string, QueryValue>)}`,
    ),

  getById: (idOrSlug: string) =>
    apiRequest<{ scheme: GovernmentBenefit }>(`/api/schemes/${idOrSlug}`),

  getRecommended: () =>
    apiRequest<{ schemes: GovernmentBenefit[] }>("/api/schemes/recommended"),

  getCategories: () =>
    apiRequest<{ categories: SchemeCategoryMeta[] }>("/api/schemes/categories"),

  checkEligibility: (idOrSlug: string, answers?: SchemeEligibilityAnswers) =>
    apiRequest<SchemeEligibilityResult>(
      `/api/schemes/${idOrSlug}/eligibility${toQuery(
        answers as Record<string, QueryValue>,
      )}`,
    ),
};

export const schemeApplicationsApi = {
  create: (input: {
    schemeId: string;
    formData?: Record<string, unknown>;
    documents?: SchemeApplicationDocument[];
  }) =>
    apiRequest<{ application: SchemeApplication; alreadyExists?: boolean }>(
      "/api/scheme-applications",
      {
        body: JSON.stringify(input),
        method: "POST",
      },
    ),

  list: (params?: {
    status?: SchemeApplicationStatus;
    page?: number;
    limit?: number;
  }) =>
    apiRequest<{ applications: SchemeApplication[]; pagination: Pagination }>(
      `/api/scheme-applications${toQuery(params as Record<string, QueryValue>)}`,
    ),

  update: (
    id: string,
    updates: {
      status?: SchemeApplicationStatus;
      notes?: string;
      formData?: Record<string, unknown>;
      documents?: SchemeApplicationDocument[];
    },
  ) =>
    apiRequest<{ application: SchemeApplication }>(
      `/api/scheme-applications/${id}`,
      { body: JSON.stringify(updates), method: "PATCH" },
    ),

};
