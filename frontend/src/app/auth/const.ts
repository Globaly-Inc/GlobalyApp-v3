/** ponytail: sign-up is switched off for the short release — the navbar hides Get Started, sign-in
 * hides its "Sign up" link, and /auth/sign-up redirects home. Sign-in stays open. Flip to true to
 * reopen sign-up. */
export const SIGN_UP_ENABLED = false;

/** Where the app sends someone to sign in (sign-out, an expired session, accepting an invite). */
export const SIGN_IN_HREF = "/auth/sign-in";
