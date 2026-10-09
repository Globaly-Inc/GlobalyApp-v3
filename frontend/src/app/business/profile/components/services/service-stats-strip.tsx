"use client";

import { useEffect, useState } from "react";
import { businessProfileDetailApi } from "../../apis";
import type { ServiceSearchParams } from "../../apis/types";
import { PortalStats } from "../portal-ui/portal-stats";
import { PortalStatTile } from "../portal-ui/portal-stat-tile";

type Counts = { published: number; draft: number; attention: number; missingFee: number };

/** Summary strip over the services table: totals across every page, not just the loaded one.
 * Each tile is a `limit: 1` search with one filter, read from `total` — exact counts without
 * touching the table's store (calls the API directly, not the fetchServices thunk). */
export function ServiceStatsStrip({
  courseCategory,
  isInstitution,
  refreshKey,
}: Readonly<{ courseCategory?: "academic" | "short_course"; isInstitution: boolean; refreshKey: unknown }>) {
  const [counts, setCounts] = useState<Counts | null>(null);

  useEffect(() => {
    let live = true;
    const count = (f: Pick<ServiceSearchParams, "published" | "attention">) =>
      businessProfileDetailApi.searchServices({ ...f, course_category: courseCategory, page: 1, limit: 1 }).then((r) => r.total);
    Promise.all([
      count({ published: "published" }),
      count({ published: "draft" }),
      // A business's own services have no approval step — that tile is institutions only.
      isInstitution ? count({ attention: "needs_approval" }) : 0,
      count({ attention: "missing_fee" }),
    ])
      .then(([published, draft, attention, missingFee]) => { if (live) setCounts({ published, draft, attention, missingFee }); })
      .catch(() => { if (live) setCounts(null); });
    return () => { live = false; };
  }, [courseCategory, isInstitution, refreshKey]);

  if (!counts) return null;
  return (
    <PortalStats>
      <PortalStatTile value={counts.published} label="Published" />
      <PortalStatTile value={counts.draft} label="Drafts" />
      {isInstitution && <PortalStatTile value={counts.attention} label="Need approval or changes" warn />}
      <PortalStatTile value={counts.missingFee} label="Missing fees" />
    </PortalStats>
  );
}
