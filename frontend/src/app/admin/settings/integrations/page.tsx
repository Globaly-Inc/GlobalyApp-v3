"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

  useEffect(() => {
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
      <span className="text-xs text-muted-foreground">
        Saved{s.preview ? ` — ${s.preview}` : ""}
      </span>
    ) : (
      <span className="text-xs text-muted-foreground">Not set</span>
    );

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Integrations</h1>
        <p className="text-sm text-muted-foreground">
          Third-party API credentials. Values are encrypted at rest and never shown again after
          saving — re-enter a value to replace it. Environment variables act as a fallback when a
          field is not set here.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Higgsfield</CardTitle>
          <CardDescription>
            Text-to-image API used to generate AI blog cover photos. Format:{" "}
            <code>key:secret</code>. {savedBadge(status?.higgsfield_api_key)}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label htmlFor="hf-key">API key</Label>
          <Input
            id="hf-key"
            type="password"
            placeholder="hf_xxxx:hf_secret_xxxx"
            value={higgsfield}
            onChange={(e) => setHiggsfield(e.target.value)}
            autoComplete="off"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Google Search Console</CardTitle>
          <CardDescription>
            Powers the SEO/AEO dashboard rankings. Paste the full service-account JSON key (the
            account must be added as a user on the GSC property).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="gsc-json">Service-account JSON {savedBadge(status?.gsc_service_account_json)}</Label>
            <Textarea
              id="gsc-json"
              placeholder='{"type":"service_account","client_email":"...","private_key":"..."}'
              value={gscJson}
              onChange={(e) => setGscJson(e.target.value)}
              rows={5}
              className="font-mono text-xs"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="gsc-site">Site URL {savedBadge(status?.gsc_site_url)}</Label>
            <Input
              id="gsc-site"
              placeholder="sc-domain:globalyhub.com"
              value={gscSiteUrl}
              onChange={(e) => setGscSiteUrl(e.target.value)}
              autoComplete="off"
            />
          </div>
        </CardContent>
      </Card>

      <Button onClick={save} disabled={saving}>
        {saving ? "Saving..." : "Save changes"}
      </Button>
    </div>
  );
}
