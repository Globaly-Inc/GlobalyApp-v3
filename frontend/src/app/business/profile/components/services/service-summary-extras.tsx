// Self-service twin of admin's service-summary-extras.tsx — same cards/layout, rewired to the
// auth-scoped businessProfileDetailApi (works for both a business and an institution session
// transparently, since the backend resolves org id from the caller's own auth context) instead
// of admin's kind/orgId-parameterised businessesApi. Split per component; this keeps the old
// import path working.
export { PublicBadge } from "./public-badge";
export { VisibilityToggle, type SectionVisibility } from "./visibility-toggle";
export { ServiceSummaryBodyExtras } from "./service-summary-body-extras";
export { ServiceSummarySidebarExtras } from "./service-summary-sidebar-extras";
