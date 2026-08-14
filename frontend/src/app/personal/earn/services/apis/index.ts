import { createApi } from "@/lib/api/create-api";
import { servicesMockApi } from "./mock-data";
import { servicesRealApi } from "./real-api";

export const servicesApi = createApi({ mock: servicesMockApi, real: servicesRealApi });

export type {
  BrowseFilters,
  BrowseResult,
  CheckoutSession,
  PublicReview,
  PublicService,
  City,
  Currency,
  CurrencyTotals,
  Listing,
  ListingInput,
  Order,
  OrderRole,
  OrderStatus,
  Review,
  ServiceCategory,
  ServicesMeta,
  Summary,
  UploadedCover,
  VerifyPaymentResult,
  // Appended: the booking handshake.
  BookingField,
  BookingAnswerValue,
  BookingDetails,
} from "./types";
export { CURRENCIES, ORDER_STATUSES } from "./types";
