"use client";

import { useRouter } from "next/navigation";
import { Building2, Loader2, Plus } from "lucide-react";
import { BackButton } from "@/components/ui/back-button";
import { Button } from "@/components/ui/button";
import { PageBody } from "@/components/ui/page-body";
import { PageHeader } from "@/components/ui/page-header";
import { StickySaveBar } from "@/components/ui/sticky-save-bar";
import { CategoryPickerCard } from "./add-business/category-picker-card";
import { BasicInfoCard } from "./add-business/basic-info-card";
import { LocationCard } from "./add-business/location-card";
import { ContactCard } from "./add-business/contact-card";
import { SocialMediaCard } from "./add-business/social-media-card";
import { MediaUrlsCard } from "./add-business/media-urls-card";
import { ServiceCategoriesCard } from "./add-business/service-categories-card";
import { useAddBusinessForm } from "./use-add-business-form";

export function AddBusinessView() {
  const router = useRouter();
  const {
    form, setForm, set, errors, setErrors, saving, businessCategories, serviceCategories, countries,
    allowedServiceIds, phoneCountryId, setPhoneCountryId, phoneNumber, setPhoneNumber, logoPreview, coverPreview,
    pickLogoFile, pickCoverFile, handleNameChange, handleCategoryChange, toggleServiceCategory, handleSubmit,
    countryOptions, phoneCountryOptions,
  } = useAddBusinessForm();

  const createButton = (
    <Button className="gap-2" disabled={saving} onClick={handleSubmit}>
      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
      {saving ? "Creating…" : "Create Business"}
    </Button>
  );

  return (
    <PageBody>
      <PageHeader
        leading={<BackButton onClick={() => router.back()} label="Back" />}
        title={<><Building2 /> Add Business</>}
        subtitle="Pre-seed a business listing. It will be created in pending status with is_claimed = false."
      >
        {createButton}
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <CategoryPickerCard
            categories={businessCategories}
            selectedId={form.business_category_id}
            onSelect={handleCategoryChange}
            error={errors.business_category_id}
          />

          <BasicInfoCard
            businessName={form.business_name}
            onNameChange={handleNameChange}
            nameError={errors.business_name}
            description={form.description ?? ""}
            onDescriptionChange={(v) => set("description", v)}
          />

          <LocationCard
            countryOptions={countryOptions}
            countryId={form.country_id}
            onCountryChange={(id) => set("country_id", id)}
            countryIso2={countries.find((c) => c.id === form.country_id)?.iso2}
            address={form.address ?? ""}
            onAddressChange={(v) => set("address", v)}
            onPlaceResolved={(details) => {
              setForm((f) => ({
                ...f,
                latitude: details.latitude,
                longitude: details.longitude,
                city: details.city ?? f.city,
                state: details.state ?? f.state,
                postcode: details.postcode ?? f.postcode,
              }));
            }}
            city={form.city ?? ""}
            onCityChange={(v) => set("city", v)}
            state={form.state ?? ""}
            onStateChange={(v) => set("state", v)}
            postcode={form.postcode ?? ""}
            onPostcodeChange={(v) => set("postcode", v)}
            website={form.website ?? ""}
            onWebsiteChange={(v) => set("website", v)}
            websiteError={errors.website}
          />

          <ContactCard
            firstName={form.first_name ?? ""}
            onFirstNameChange={(v) => set("first_name", v)}
            firstNameError={errors.first_name}
            lastName={form.last_name ?? ""}
            onLastNameChange={(v) => set("last_name", v)}
            lastNameError={errors.last_name}
            email={form.email ?? ""}
            onEmailChange={(v) => set("email", v)}
            emailError={errors.email}
            phoneCountryId={phoneCountryId}
            onPhoneCountryChange={(v) => {
              setPhoneCountryId(v);
              setErrors((e) => (e.phone ? { ...e, phone: undefined } : e));
            }}
            phoneCountryOptions={phoneCountryOptions}
            phoneNumber={phoneNumber}
            onPhoneNumberChange={(v) => {
              setPhoneNumber(v);
              setErrors((e) => (e.phone ? { ...e, phone: undefined } : e));
            }}
            phoneError={errors.phone}
          />

          <SocialMediaCard
            fields={[
              { label: "LinkedIn", placeholder: "https://linkedin.com/company/...", value: form.linkedin_url ?? "", onChange: (v) => set("linkedin_url", v), error: errors.linkedin_url },
              { label: "Facebook", placeholder: "https://facebook.com/...", value: form.facebook_url ?? "", onChange: (v) => set("facebook_url", v), error: errors.facebook_url },
              { label: "Instagram", placeholder: "https://instagram.com/...", value: form.instagram_url ?? "", onChange: (v) => set("instagram_url", v), error: errors.instagram_url },
              { label: "Twitter / X", placeholder: "https://twitter.com/...", value: form.twitter_url ?? "", onChange: (v) => set("twitter_url", v), error: errors.twitter_url },
            ]}
          />

          <MediaUrlsCard
            logoPreview={logoPreview}
            onLogoFile={pickLogoFile}
            coverPreview={coverPreview}
            onCoverFile={pickCoverFile}
            logoFallback={form.business_name.charAt(0).toUpperCase() || "B"}
          />
        </div>

        <div className="flex flex-col gap-6">
          <ServiceCategoriesCard categories={serviceCategories} selectedIds={allowedServiceIds} onToggle={toggleServiceCategory} />
        </div>
      </div>

      <StickySaveBar>
        <Button variant="outline" onClick={() => router.back()}>Cancel</Button>
        {createButton}
      </StickySaveBar>
    </PageBody>
  );
}
