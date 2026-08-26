"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { businessesApi } from "../apis";
import { DetailView } from "./detail-view";

export function BusinessOrInstitutionDetailView({ id, kind: kindProp }: Readonly<{ id: number; kind?: "business" | "institution" }>) {
  const [kind, setKind] = useState<"business" | "institution" | null>(kindProp ?? null);
  const [notFound, setNotFound] = useState(false);

  const resolvedRef = useRef<number | null>(null);
  useEffect(() => {
    if (kindProp) { setKind(kindProp); return; }
    if (resolvedRef.current === id) return;
    resolvedRef.current = id;
    setKind(null);
    setNotFound(false);
    businessesApi
      .getListingKind(id)
      .then((r) => setKind(r.kind))
      .catch(() => setNotFound(true));
  }, [id, kindProp]);

  if (notFound) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-sm text-destructive">Not found.</p>
      </div>
    );
  }

  if (kind === null) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return <DetailView kind={kind} id={id} />;
}
