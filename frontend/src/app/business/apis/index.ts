import { createApi } from "@/lib/api/create-api";
import { businessMockApi } from "./mock-data";
import { businessRealApi } from "./real-api";

export const businessApi = createApi({ mock: businessMockApi, real: businessRealApi });
export type {
  BusinessType, BusinessProfile, BusinessProfilePatch, BusinessRegisterInput, RegisterBusinessResult,
  InstitutionRegisterInput, RegisterInstitutionResult, SelectOption, SocialLinks, StartExtractionInput,
  ExtractionStatus, ExtractionCounts, SiteUrl, SiteUrlCategory, SiteUrlCounts, SiteUrlsQuery, SiteUrlsPage,
  SiteUrlSnapshot, SiteUrlRefreshResult, OnboardingProgress, OnboardingStep, WidgetAnalytics, WidgetAnalyticsMonth,
} from "./types";
