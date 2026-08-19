import type { OrgProfile } from "../types";
import { safeUrl } from "@/lib/safe-url";
import { ProfileHero } from "./profile-hero";
import { ProfileServices } from "./profile-services";
import { ProfileSidebar } from "./profile-sidebar";

const SERVICES_HEADING = {
  institution: "Courses & programs",
  agent: "Services",
} as const;

// JSON.stringify escapes quotes but not "<", so an org name containing "</script>"
// would close the tag early. Escaping the angle bracket is what makes this inert.
const jsonLd = (data: Record<string, unknown>) => JSON.stringify(data).replace(/</g, "\\u003c");

export function OrgProfileView({ org }: Readonly<{ org: OrgProfile }>) {
  const gallery = org.gallery_images.map(safeUrl).filter((src): src is string => src !== null);

  return (
    <div>
      <ProfileHero org={org} />

      {/* The API already builds the EducationalOrganization graph — emit it rather than
          rebuilding a second, drifting copy in the client. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(org.seo.structured_data) }}
      />

      <div className="container mx-auto max-w-5xl px-4 py-8">
        <div className="grid gap-8 md:grid-cols-3">
          <div className="space-y-8 md:col-span-2">
            {org.description && (
              <section>
                <h2 className="mb-3 text-lg font-semibold text-foreground">About {org.name}</h2>
                <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{org.description}</p>
              </section>
            )}

            {gallery.length > 0 && (
              <section>
                <h2 className="mb-3 text-lg font-semibold text-foreground">Gallery</h2>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {gallery.map((src) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={src} src={src} alt="" className="aspect-video w-full rounded-lg object-cover" />
                  ))}
                </div>
              </section>
            )}

            <ProfileServices
              services={org.services}
              total={org.services_total}
              heading={SERVICES_HEADING[org.kind]}
            />
          </div>

          <ProfileSidebar org={org} />
        </div>
      </div>
    </div>
  );
}
