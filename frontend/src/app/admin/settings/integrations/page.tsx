"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { FormSection } from "@/components/ui/form-section";
import { Input } from "@/components/ui/input";
import { PageBody } from "@/components/ui/page-body";
import { PageHeader } from "@/components/ui/page-header";
import { StickySaveBar } from "@/components/ui/sticky-save-bar";
import { Textarea } from "@/components/ui/textarea";
import { httpGet, httpPut } from "@/lib/api/http";

const BASE = "/api/v3/admin/settings/integrations";

type SettingStatus = { set: boolean; preview: string | null; updated_at: string | null };
type IntegrationsStatus = {
  higgsfield_api_key: SettingStatus;
  gsc_service_account_json: SettingStatus;
  gsc_site_url: SettingStatus;
};

// ponytail: local state, no Redux slice — one page, three fields, no cross-page consumers.
export default function IntegrationsSettingsPage() {
  const [status, setStatus] = useState<IntegrationsStatus | null>(null);
  const [higgsfield, setHiggsfield] = useState("");
  const [gscJson, setGscJson] = useState("");
  const [gscSiteUrl, setGscSiteUrl] = useState("");
  const [saving, setSaving] = useState(false);

  const load = () =>
    httpGet<IntegrationsStatus>(BASE)
      .then(setStatus)
      .catch(() => toast.error("Could not load integration settings"));

  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    void load();
  }, []);

  const save = async () => {
    // Only send fields the admin actually typed — an untouched field stays as-is on the server.
    const body: Record<string, string> = {};
    if (higgsfield.trim()) body.higgsfield_api_key = higgsfield.trim();
    if (gscJson.trim()) body.gsc_service_account_json = gscJson.trim();
    if (gscSiteUrl.trim()) body.gsc_site_url = gscSiteUrl.trim();
    if (!Object.keys(body).length) {
      toast.info("Nothing to save — fill in a field first.");
      return;
    }
    setSaving(true);
    try {
      await httpPut(BASE, body);
      toast.success("Integration settings saved");
      setHiggsfield("");
      setGscJson("");
      setGscSiteUrl("");
      await load();
    } catch {
      toast.error("Save failed", { description: "Check the values and try again." });
    } finally {
      setSaving(false);
    }
  };

  const savedBadge = (s?: SettingStatus) =>
    s?.set ? (
      <Badge variant="success" className="max-w-48">
        <span className="truncate">Saved{s.preview ? ` — ${s.preview}` : ""}</span>
      </Badge>
    ) : (
      <Badge variant="outline" className="text-muted-foreground">Not set</Badge>
    );

  return (
    <PageBody>
      <PageHeader
        title="Integrations"
        subtitle="Third-party API credentials. Values are encrypted at rest and never shown again after saving — re-enter a value to replace it. Environment variables act as a fallback when a field is not set here."
      />

      <FormSection
        title="Higgsfield"
        columns={1}
        description={
          <>
            Text-to-image API used to generate AI blog cover photos. Format: <code className="font-mono text-xs md:text-xs">key:secret</code>.
          </>
        }
        action={savedBadge(status?.higgsfield_api_key)}
      >
        <FormField label="API key" htmlFor="hf-key">
          <Input
            id="hf-key"
            type="password"
            placeholder="hf_xxxx:hf_secret_xxxx"
            value={higgsfield}
            onChange={(e) => setHiggsfield(e.target.value)}
            autoComplete="off"
          />
        </FormField>
      </FormSection>

      <FormSection
        title="Google Search Console"
        columns={1}
        description="Powers the SEO/AEO dashboard rankings. Paste the full service-account JSON key (the account must be added as a user on the GSC property)."
      >
        <FormField
          label={<span className="flex flex-wrap items-center gap-2">Service-account JSON {savedBadge(status?.gsc_service_account_json)}</span>}
          htmlFor="gsc-json"
        >
          <Textarea
            id="gsc-json"
            placeholder='{"type":"service_account","client_email":"...","private_key":"..."}'
            value={gscJson}
            onChange={(e) => setGscJson(e.target.value)}
            rows={5}
            className="font-mono text-xs md:text-xs"
          />
        </FormField>
        <FormField
          label={<span className="flex flex-wrap items-center gap-2">Site URL {savedBadge(status?.gsc_site_url)}</span>}
          htmlFor="gsc-site"
        >
          <Input
            id="gsc-site"
            placeholder="sc-domain:globalyhub.com"
            value={gscSiteUrl}
            onChange={(e) => setGscSiteUrl(e.target.value)}
            autoComplete="off"
          />
        </FormField>
      </FormSection>

      <StickySaveBar>
        <Button onClick={save} disabled={saving}>
          {saving ? "Saving..." : "Save changes"}
        </Button>
      </StickySaveBar>
    </PageBody>
  );
}
