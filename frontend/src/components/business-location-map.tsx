// Keyless Google embed map (`output=embed`): no API key, no billing, no SDK script. It shows one
// pin at a time — the selected location, or the first — so selecting a card swaps the iframe src,
// which stands in for panning. Addresses go straight into the query; Google resolves them itself,
// so no geocoding is needed either.
// ponytail: single pin only — the keyed Maps JS SDK version (multi-marker, fitBounds, backend
// geocode) lived here until Sep 2026; recover it from git history if all-pins-at-once matters.

export type MapLocation = {
  id: string;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
};

export function BusinessLocationMap({
  locations,
  selectedId,
  zoom = 14,
  className = "h-72 w-full",
}: Readonly<{
  locations: MapLocation[];
  selectedId?: string | null;
  /** Lower is wider. 14 frames a street, 11 frames a city — the widget's campus map uses 11, which
   *  is as precise as a reply is allowed to be about where an institution sits. */
  zoom?: number;
  /** The widget panel is 380px wide; h-72 is roughly half its height. */
  className?: string;
}>) {
  const loc = locations.find((l) => l.id === selectedId) ?? locations[0];
  if (!loc) return null;
  const query =
    loc.latitude != null && loc.longitude != null
      ? `${loc.latitude},${loc.longitude}`
      : (loc.address ?? loc.name);
  return (
    <iframe
      title={`Map of ${loc.name}`}
      src={`https://maps.google.com/maps?q=${encodeURIComponent(query)}&z=${zoom}&output=embed`}
      className={`${className} rounded-lg border border-border`}
      loading="lazy"
      referrerPolicy="no-referrer-when-downgrade"
    />
  );
}
