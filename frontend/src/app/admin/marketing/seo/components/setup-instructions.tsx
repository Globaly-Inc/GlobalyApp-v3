import { CheckCircle2, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const STEPS = [
  "Verify your domain property in Google Search Console.",
  "Create a Google Cloud service account and download its JSON key file.",
  "Add the service account's email address as a user on the Search Console property (Restricted / read access is enough).",
  "Set GSC_KEY_FILE on the backend to the path of that JSON key file — same pattern as GCS_KEY_FILE.",
  "Set GSC_SITE_URL to the verified property, e.g. sc-domain:globalyhub.com.",
  "Restart the backend. The dashboard connects automatically once both are set.",
];

export function SetupInstructions() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Connect Google Search Console</CardTitle>
      </CardHeader>
      <CardContent className="px-(--card-spacing)">
        <p className="mb-4 text-sm text-muted-foreground">
          Keyword rankings, suggestions, and the AEO action plan all depend on Search Console
          data. Nothing is faked here — connect GSC to unlock the dashboard.
        </p>
        <ol className="flex flex-col gap-3">
          {STEPS.map((step, i) => (
            <li key={step} className="flex items-start gap-3 text-sm">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                {i + 1}
              </span>
              <span className="text-foreground">{step}</span>
            </li>
          ))}
        </ol>
        <div className="mt-5 flex flex-col gap-2 rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5 font-mono">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            GSC_KEY_FILE=./gsc-service-account.json
          </div>
          <div className="flex items-center gap-1.5 font-mono">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            GSC_SITE_URL=sc-domain:globalyhub.com
          </div>
        </div>
        <a
          href="https://search.google.com/search-console"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          Open Google Search Console
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </CardContent>
    </Card>
  );
}
