"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  BadgeCheck,
  CalendarDays,
  MessageSquare,
  CreditCard,
  Loader2,
  MapPin,
  ShieldCheck,
  Sparkles,
  Star,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { useAuthState } from "@/app/auth/store/auth-slice";
import { servicesApi } from "@/app/personal/earn/services/apis";
import { safeUrl } from "@/lib/safe-url";
import type { PublicReview, PublicService } from "@/app/personal/earn/services/apis";
import { formatDate, formatMoney } from "@/app/personal/earn/services/utils";
import { ReviewForm } from "@/app/personal/earn/services/components/review-form";
import { CategoryCover } from "@/app/personal/earn/services/components/category-cover";
import { BookingDialog } from "@/app/personal/earn/services/components/booking-dialog";
import type { BookingAnswerValue } from "@/app/personal/earn/services/apis";

export function ServiceDetailView({ serviceId }: Readonly<{ serviceId: number }>) {
  const router = useRouter();
  const { user } = useAuthState();

  const [service, setService] = useState<PublicService | null>(null);
  const [reviews, setReviews] = useState<PublicReview[]>([]);
  const [status, setStatus] = useState<"loading" | "idle" | "missing">("loading");
  const [buying, setBuying] = useState(false);
  const [bookingOpen, setBookingOpen] = useState(false);
  const providerPhoto = safeUrl(service?.provider_photo_url);

  useEffect(() => {
    let cancelled = false;
    Promise.all([servicesApi.getPublicService(serviceId), servicesApi.getPublicReviews(serviceId).catch(() => [])])
      .then(([found, list]) => {
        if (cancelled) return;
        setService(found);
        setReviews(list);
        setStatus("idle");
      })
      .catch(() => !cancelled && setStatus("missing"));
    return () => {
      cancelled = true;
    };
  }, [serviceId]);

  /**
   * Booking is a request now, not a purchase, so this opens the form rather than going to checkout.
   *
   * The provider's availability is the real constraint — an airport pickup at 6am is a commitment against one
   * person's calendar — so taking the money first would mean refunding it whenever the answer is no.
   */
  const handleBuy = () => {
    if (!service) return;
    if (!user) {
      router.push(`/auth/sign-in?redirect=${encodeURIComponent(`/service/${service.id}`)}`);
      return;
    }
    setBookingOpen(true);
  };

  const submitBooking = async (answers: Record<string, BookingAnswerValue>, note: string | null) => {
    if (!service) return;
    setBuying(true);
    try {
      const order = await servicesApi.createOrder(service.id, { answers, note });
      setBookingOpen(false);
      toast.success("Request sent", {
        description: "The provider will confirm before you pay. We'll email you either way.",
      });
      router.push(`/personal/earn/services/orders/${order.id}`);
    } catch (err) {
      toast.error("Couldn't send your request", {
        description: err instanceof Error ? err.message : "Please try again.",
      });
    } finally {
      setBuying(false);
    }
  };

  if (status === "loading") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (status === "missing" || !service) {
    return (
      <div className="container mx-auto flex min-h-[60vh] flex-col items-center justify-center gap-3 px-3 text-center">
        <h1 className="text-2xl font-bold text-foreground">This service isn&apos;t available</h1>
        <p className="text-muted-foreground">It may have been paused or removed by the person offering it.</p>
        <Button variant="outline" render={<Link href="/services">Browse all services</Link>} />
      </div>
    );
  }

  // No client-side "is this mine?" check: this page is unauthenticated, so the server cannot mark the listing
  // as the viewer's. A seller who reaches their own listing gets the server's refusal in the toast.
  const place = [service.city_name, service.country_name].filter(Boolean).join(", ");
  const rated = service.total_reviews > 0;

  return (
    <div className="pb-16">
      {/* A tinted band behind the header, so the title has something to sit on rather than floating in white
          space — which is what a listing with no cover and no description looked like. */}
      <div className="border-b border-border bg-gradient-to-b from-primary/[0.06] to-transparent">
        <div className="container mx-auto px-3 py-6 sm:px-4">
          <Link
            href="/services"
            className="mb-5 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            All services
          </Link>

          <div className="max-w-3xl space-y-3">
            <Badge variant="secondary" className="bg-primary/10 text-primary">
              {service.category_name}
            </Badge>
            <h1 className="text-3xl font-bold leading-tight text-foreground sm:text-4xl">{service.title}</h1>

            {/* One meta row that always says something. Every item is a real field — and when a listing is new
                it says so, instead of collapsing to nothing. */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
              {place && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-4 w-4" />
                  {place}
                </span>
              )}
              <span className="inline-flex items-center gap-1.5">
                {rated ? (
                  <>
                    <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                    <span className="font-medium text-foreground">{service.avg_rating.toFixed(1)}</span>
                    <span>
                      ({service.total_reviews} {service.total_reviews === 1 ? "review" : "reviews"})
                    </span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Newly listed
                  </>
                )}
              </span>
              {service.total_orders > 0 && (
                <span className="inline-flex items-center gap-1.5">
                  <BadgeCheck className="h-4 w-4" />
                  {service.total_orders} {service.total_orders === 1 ? "order" : "orders"} completed
                </span>
              )}
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="h-4 w-4" />
                Listed {formatDate(service.created_at)}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-3 py-8 sm:px-4">
        <div className="grid gap-8 lg:grid-cols-[1fr_360px] lg:items-start">
          <div className="space-y-8">
            {/* The cover, or this category's stand-in. An omitted block left a hole in the layout. */}
            <CategoryCover
              coverUrl={service.cover_url}
              categorySlug={service.category_slug}
              categoryName={service.category_name}
              categoryIcon={service.category_icon}
              title={service.title}
              showLabel
              sizes="100vw"
              className="aspect-[16/7] w-full rounded-xl border border-border"
              iconClassName="size-12"
            />

            <Section title="About this service">
              {service.description ? (
                <p className="whitespace-pre-wrap leading-relaxed text-foreground">{service.description}</p>
              ) : (
                <p className="text-muted-foreground">
                  {service.provider_name} hasn&apos;t added a description yet. Book the service and use the order
                  notes to agree the details.
                </p>
              )}
            </Section>

            <Section title="About the provider">
              <div className="flex items-start gap-4 rounded-lg border border-border p-4">
                <Avatar className="size-12">
                  {providerPhoto && <AvatarImage src={providerPhoto} alt={service.provider_name} />}
                  <AvatarFallback className="text-base">
                    {service.provider_name[0]?.toUpperCase() ?? "S"}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 space-y-1">
                  <p className="font-semibold text-foreground">{service.provider_name}</p>
                  <p className="text-sm text-muted-foreground">
                    A student offering {service.category_name.toLowerCase()}
                    {place ? ` in ${place}` : ""}.
                  </p>
                  {rated && (
                    <p className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                      {service.avg_rating.toFixed(1)} from {service.total_reviews}{" "}
                      {service.total_reviews === 1 ? "buyer" : "buyers"}
                    </p>
                  )}
                </div>
              </div>
            </Section>

            <Section title={rated ? `Reviews (${service.total_reviews})` : "Reviews"}>
              {reviews.length > 0 ? (
                <div className="space-y-3">
                  {reviews.map((review) => (
                    <div key={review.id} className="rounded-lg border border-border p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Stars value={review.rating} />
                        <span className="text-sm font-medium text-foreground">{review.reviewer_name}</span>
                        {/* Anyone may review, so the badge is what separates signal from noise. */}
                        {review.is_verified_purchase && (
                          <Badge variant="secondary" className="gap-1 text-[11px]">
                            <BadgeCheck className="size-3" />
                            Verified purchase
                          </Badge>
                        )}
                        <span className="text-xs text-muted-foreground">{formatDate(review.created_at)}</span>
                      </div>
                      {review.comment && <p className="mt-2 text-sm text-foreground">{review.comment}</p>}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                  No reviews yet. Reviews from people who bought this service are marked as a verified
                  purchase.
                </p>
              )}

              {/* Signed-in only: reviewing is attributed and limited to one per person per listing. */}
              {user && (
                <div className="mt-4">
                  <ReviewForm serviceId={serviceId} />
                </div>
              )}
            </Section>
          </div>

          <div className="space-y-4 lg:sticky lg:top-24">
            <Card className="overflow-hidden">
              <CardContent className="space-y-4 py-6">
                <div>
                  <p className="text-3xl font-bold tabular-nums text-foreground">
                    {formatMoney(service.price_minor, service.currency)}
                  </p>
                  <p className="text-xs text-muted-foreground">One-off payment in {service.currency}</p>
                </div>

                <Button className="h-11 w-full text-base" onClick={handleBuy} disabled={buying}>
                  {user ? "Request this booking" : "Sign in to book"}
                </Button>

                {/* The buyer's protection, stated before they pay rather than after. */}
                <div className="flex gap-2 rounded-md bg-muted/60 p-3 text-xs text-muted-foreground">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>
                    The provider confirms your request before you pay anything. Once paid, the money is held by
                    Globaly rather than passed straight on, and you can report a problem from the order.
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* The actual order lifecycle, in order. Not filler: it is the thing buyers most need to
                understand before paying a stranger, and it is exactly what the API enforces. */}
            <Card>
              <CardContent className="py-5">
                <p className="mb-3 text-sm font-semibold text-foreground">How booking works</p>
                <ol className="space-y-3">
                  <Step icon={CreditCard} n={1} title="Send a request">
                    Tell the provider what you need. Nothing is charged yet.
                  </Step>
                  <Step icon={ShieldCheck} n={2} title="They accept, you pay">
                    If it suits their schedule you&apos;ll be emailed to pay and confirm. If not, they tell you
                    why.
                  </Step>
                  <Step icon={MessageSquare} n={3} title="Message the provider">
                    Agree the details directly on your order — where to meet, what time.
                  </Step>
                  <Step icon={BadgeCheck} n={4} title="Leave a review">
                    Tell other students how it went. Yours is marked as a verified purchase.
                  </Step>
                </ol>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Built from `service.booking_fields`, which the API returns with the listing — so a category that
          asks nothing renders a plain confirm and one that asks four questions renders four. */}
      <BookingDialog
        open={bookingOpen}
        onOpenChange={setBookingOpen}
        serviceTitle={service.title}
        priceLabel={formatMoney(service.price_minor, service.currency)}
        fields={service.booking_fields}
        submitting={buying}
        onSubmit={submitBooking}
      />
    </div>
  );
}

function Section({ title, children }: Readonly<{ title: string; children: React.ReactNode }>) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      {children}
    </section>
  );
}

function Stars({ value }: Readonly<{ value: number }>) {
  return (
    <span className="flex">
      {[1, 2, 3, 4, 5].map((v) => (
        <Star
          key={v}
          className={cn("h-4 w-4", v <= value ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground")}
        />
      ))}
    </span>
  );
}

function Step({
  icon: Icon,
  n,
  title,
  children,
}: Readonly<{ icon: typeof CreditCard; n: number; title: string; children: React.ReactNode }>) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className="space-y-0.5">
        <span className="block text-sm font-medium text-foreground">
          {n}. {title}
        </span>
        <span className="block text-xs text-muted-foreground">{children}</span>
      </span>
    </li>
  );
}
