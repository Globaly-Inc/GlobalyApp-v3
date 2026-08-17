// Honest stand-in for an admin page whose backend does not exist yet.
//
// It renders no data and makes no request — there is no table behind these pages, so a
// list (real or mocked) would be a lie and a real-api call could only 404. It names the
// wave that builds the feature instead. Replace the whole page with a real view when
// that wave lands; do not add an endpoint here to make the shell look busy.

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Construction } from "lucide-react";

export interface AdminNotAvailableViewProps {
  title: string;
  description: string;
  /** The wave that builds the backend, e.g. "D". */
  wave: string;
  /** What that wave delivers, in one sentence. */
  waveScope: string;
}

export function AdminNotAvailableView({
  title,
  description,
  wave,
  waveScope,
}: Readonly<AdminNotAvailableViewProps>) {
  return (
    <div>
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-foreground">{title}</h1>
        <p className="text-muted-foreground mt-1">{description}</p>
      </div>

      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <Construction className="h-8 w-8 text-muted-foreground" aria-hidden />
          <div className="flex items-center gap-2">
            <p className="text-base font-medium text-foreground">Not yet available</p>
            <Badge variant="outline">Wave {wave}</Badge>
          </div>
          <p className="max-w-md text-sm text-muted-foreground">{waveScope}</p>
          <p className="max-w-md text-xs text-muted-foreground">
            There is no backend for this page yet, so nothing is being loaded.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
