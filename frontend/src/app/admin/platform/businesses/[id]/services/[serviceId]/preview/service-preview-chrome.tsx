"use client";

import { useRouter } from "next/navigation";
import { BackButton } from "@/components/ui/back-button";
import { Badge } from "@/components/ui/badge";
import { PageBody } from "@/components/ui/page-body";
import { PageHeader } from "@/components/ui/page-header";

/**
 * Admin chrome around the read-only service preview (business + institution routes). The preview
 * itself renders `embedded`, so this owns the back button and the page width it used to own.
 */
export function ServicePreviewChrome({ children }: Readonly<{ children: React.ReactNode }>) {
  const router = useRouter();
  return (
    <PageBody className="mx-auto max-w-3xl pb-20">
      <PageHeader
        leading={<BackButton onClick={() => router.back()} label="Back to editor" />}
        title="Service preview"
        subtitle="What a visitor would see. Read-only."
        badges={<Badge variant="info">Preview</Badge>}
      />
      {children}
    </PageBody>
  );
}
