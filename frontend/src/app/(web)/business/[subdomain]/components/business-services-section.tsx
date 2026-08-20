import { Briefcase, ArrowUpRight } from "lucide-react";
import type { BusinessService } from "../../../search/types";

export function BusinessServicesSection({ services = [] }: Readonly<{ services?: BusinessService[] }>) {
  if (services.length === 0) return null;

  return (
    <section className="py-12 bg-muted/30 border-y border-border">
      <div className="container max-w-6xl mx-auto px-4">
        <div className="flex items-end justify-between mb-6">
          <div>
            <p className="text-xs font-semibold text-primary uppercase tracking-wide mb-1">What we offer</p>
            <h2 className="text-2xl font-bold text-foreground">Our Services</h2>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {services.map((service) => (
            <div
              key={service.id}
              className="group bg-card border border-border rounded-2xl p-5 hover:shadow-lg hover:-translate-y-0.5 hover:border-primary/40 transition-all"
            >
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Briefcase className="h-5 w-5 text-primary" />
                </div>
                <ArrowUpRight className="h-4 w-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
              </div>
              <h3 className="font-semibold text-foreground leading-snug mb-1.5">{service.name}</h3>
              {service.description && (
                <p className="text-sm text-muted-foreground leading-relaxed mb-3 line-clamp-3">{service.description}</p>
              )}
              {service.price && (
                <p className="text-sm font-bold text-primary">From ${Number(service.price).toLocaleString()}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
