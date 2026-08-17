// Mocks are opt-in ONLY. Anything other than the literal "true" — including the
// variable being unset or misspelled — serves the real API. A misconfigured deploy
// must fail loudly against the backend, never silently ship a fake UI.
export const MOCK_DATA = process.env.NEXT_PUBLIC_MOCK_DATA === "true";

if (MOCK_DATA) {
  console.warn(
    "[GlobalyApp] MOCK DATA IS ON — every API call is served from local fixtures, not the backend. " +
      "Set NEXT_PUBLIC_MOCK_DATA=false (or unset it) to hit the real API.",
  );
}
