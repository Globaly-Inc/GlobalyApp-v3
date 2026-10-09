import { z } from "zod";
import { isValidPhoneForCountry } from "@/app/admin/platform/businesses/utils";
import { splitPhone, toNumberOrNull } from "@/lib/utils";
import type { BusinessProfile } from "@/app/business/apis/types";
import type { Country } from "@/app/geo/apis";

const REQUIRED = "This field is required";

export type ContactFormState = {
  email: string;
  phoneCountryId: string;
  phoneNumber: string;
  website: string;
  countryId: string;
  address: string;
  city: string;
  state: string;
  postcode: string;
  latitude: number | null;
  longitude: number | null;
};

// Same rules the details dialog enforced — the fields moved into the card, the validation didn't
// change. Postcode stays optional: plenty of the addresses here have none.
export function buildContactSchema(countries: Country[]): z.ZodType<ContactFormState> {
  return z.object({
    email: z.string().min(1, REQUIRED).pipe(z.email("Enter a valid email")),
    phoneCountryId: z.string().min(1, REQUIRED),
    phoneNumber: z.string().min(1, REQUIRED),
    website: z.string().refine((v) => v === "" || z.string().url().safeParse(v).success, "Enter a valid URL"),
    countryId: z.string().min(1, REQUIRED),
    address: z.string().min(1, REQUIRED),
    city: z.string().min(1, REQUIRED),
    state: z.string().min(1, REQUIRED),
    postcode: z.string(),
    latitude: z.number().nullable(),
    longitude: z.number().nullable(),
  }).superRefine((data, ctx) => {
    if (!data.phoneCountryId || !data.phoneNumber) return;
    const iso2 = countries.find((c) => String(c.id) === data.phoneCountryId)?.iso2;
    if (!isValidPhoneForCountry(data.phoneNumber, iso2)) {
      ctx.addIssue({ code: "custom", path: ["phoneNumber"], message: "Enter a valid phone number for the selected country" });
    }
  });
}

export function toContactForm(profile: BusinessProfile, countries: Country[]): ContactFormState {
  const { phoneCountryId, phoneNumber } = splitPhone(profile.phone, countries);
  return {
    email: profile.email ?? "",
    phoneCountryId,
    phoneNumber,
    website: profile.website ?? "",
    countryId: profile.country_id ? String(profile.country_id) : "",
    address: profile.address ?? "",
    city: profile.city ?? "",
    state: profile.state ?? "",
    postcode: profile.postcode ?? "",
    latitude: toNumberOrNull(profile.latitude),
    longitude: toNumberOrNull(profile.longitude),
  };
}
