import { Fragment } from "react";
import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { comparisonSections } from "../data";

const planNames = ["Free", "Starter", "Growth", "Pro", "Enterprise"];

export function PricingComparisonTable() {
  return (
    <section className="bg-muted/30 py-20">
      <div className="container mx-auto px-4">
        <div className="mb-10 text-center">
          <h2 className="text-3xl font-bold">Full comparison</h2>
          <p className="text-muted-foreground">Everything, side by side.</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-sm">
            <thead>
              <tr className="border-b-2">
                <th className="px-4 py-3 text-left font-semibold">Feature</th>
                {planNames.map((n, i) => (
                  <th
                    key={n}
                    className={`px-3 py-3 text-center font-semibold ${i === 3 ? "bg-primary/5 text-primary" : ""}`}
                  >
                    {n}
                    {i === 3 && <Badge className="ml-1 bg-primary text-[10px] text-primary-foreground">Popular</Badge>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {comparisonSections.map((section) => (
                <Fragment key={section.title}>
                  <tr className="bg-muted/50">
                    <td colSpan={6} className="px-4 py-2 text-xs font-bold tracking-wider text-muted-foreground uppercase">
                      {section.title}
                    </td>
                  </tr>
                  {section.rows.map((row) => (
                    <tr key={row.feature} className="border-b">
                      <td className="px-4 py-2.5 text-muted-foreground">{row.feature}</td>
                      {row.values.map((v, i) => (
                        <td key={i} className={`px-3 py-2.5 text-center ${i === 3 ? "bg-primary/5 font-medium" : ""}`}>
                          {v === "✓" ? (
                            <Check className="mx-auto h-4 w-4 text-emerald-500" />
                          ) : v === "—" ? (
                            <span className="text-muted-foreground/40">—</span>
                          ) : (
                            v
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
