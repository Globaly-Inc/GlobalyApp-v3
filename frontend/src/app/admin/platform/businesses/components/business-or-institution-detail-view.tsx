"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useAppDispatch } from "@/lib/hooks";
import { fetchBusinessDetail } from "../store/businesses-slice";
import { BusinessDetailView } from "./business-detail-view";
import { InstitutionDetailView } from "./institution-detail-view";

/**
 * `/admin/platform/businesses/:id` serves both tables under the exact same URL, with no
 * suffix or query param to tell them apart — business and institution ids are separate
 * sequences that can collide, so the only way to know which one `id` names is to ask:
 * try it as a business first, and fall back to institution on a 404.
 */
export function BusinessOrInstitutionDetailView({ id }: Readonly<{ id: number }>) {
  const dispatch = useAppDispatch();
  const [kind, setKind] = useState<"business" | "institution" | null>(null);

  const resolvedRef = useRef<number | null>(null);
  useEffect(() => {
    if (resolvedRef.current === id) return;
    resolvedRef.current = id;
    setKind(null);
    dispatch(fetchBusinessDetail(id))
      .unwrap()
      .then(() => setKind("business"))
      .catch(() => setKind("institution"));
  }, [dispatch, id]);

  if (kind === null) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return kind === "institution" ? <InstitutionDetailView id={id} /> : <BusinessDetailView id={id} />;
}
