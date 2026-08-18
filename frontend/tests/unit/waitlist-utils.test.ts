import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api/http";
import {
  RATE_LIMIT_CODE,
  failureState,
  isRateLimited,
  isRegistrantType,
  validateSignup,
} from "@/app/(web)/waitlist/utils";

describe("the 429 state", () => {
  it("recognises the API's own throttle: code FST_ERR_RATE_LIMIT with status 429", () => {
    const err = new ApiError("Too Many Requests", RATE_LIMIT_CODE, undefined, 429);
    expect(isRateLimited(err)).toBe(true);
    expect(failureState(err)).toBe("throttled");
  });

  it("recognises a 429 whose body carried no code", () => {
    // readError's catch branch produces exactly this when an ingress or CDN answers
    // the throttle with a non-JSON body. Code-only detection would miss it.
    expect(isRateLimited(new ApiError("Please try again.", undefined, undefined, 429))).toBe(true);
  });

  it("recognises the code even without a status", () => {
    expect(isRateLimited(new ApiError("Too Many Requests", RATE_LIMIT_CODE))).toBe(true);
  });

  it("does not mistake a validation failure for a throttle", () => {
    const err = new ApiError("email must be a valid email", "VALIDATION_ERROR", undefined, 400);
    expect(isRateLimited(err)).toBe(false);
    expect(failureState(err)).toBe("error");
  });

  it("does not mistake a 500 for a throttle", () => {
    // The bug the backend error-handler fix removed: every throttled route used to
    // answer 500 "Internal server error". A 500 must still read as a failure, so
    // the fix is not silently undone by classifying 500 as throttled here.
    expect(isRateLimited(new ApiError("Internal server error", undefined, undefined, 500))).toBe(false);
    expect(failureState(new ApiError("Internal server error", undefined, undefined, 500))).toBe("error");
  });

  it("treats a non-ApiError (network failure) as an error, not a throttle", () => {
    expect(isRateLimited(new TypeError("Failed to fetch"))).toBe(false);
    expect(isRateLimited(undefined)).toBe(false);
    expect(failureState(new TypeError("Failed to fetch"))).toBe("error");
  });
});

describe("ApiError carries what the UI reads", () => {
  it("keeps details, which the constructor used to drop", () => {
    // fieldErrorsFrom() reads err.details; before this was assigned it returned {}
    // for every caller in the app.
    const details = [{ path: ["email"], message: "Invalid email" }];
    expect(new ApiError("bad", "VALIDATION_ERROR", details, 400).details).toEqual(details);
  });
});

describe("isRegistrantType", () => {
  it("accepts only the backend's closed vocabulary", () => {
    for (const value of ["student", "institution", "service_provider", "other"]) {
      expect(isRegistrantType(value)).toBe(true);
    }
    expect(isRegistrantType("agent")).toBe(false);
    expect(isRegistrantType("")).toBe(false);
  });
});

describe("validateSignup", () => {
  const valid = { email: "a@b.co", name: "Ada", type: "student" };

  it("passes a well-formed sign-up", () => {
    expect(validateSignup(valid)).toEqual({});
  });

  it("flags a missing or malformed email", () => {
    expect(validateSignup({ ...valid, email: "   " }).email).toBeDefined();
    expect(validateSignup({ ...valid, email: "nope" }).email).toBeDefined();
    expect(validateSignup({ ...valid, email: `${"a".repeat(320)}@b.co` }).email).toBeDefined();
  });

  it("flags a missing or oversized name", () => {
    expect(validateSignup({ ...valid, name: "  " }).name).toBeDefined();
    expect(validateSignup({ ...valid, name: "n".repeat(121) }).name).toBeDefined();
  });

  it("flags an unchosen or unknown registrant type", () => {
    expect(validateSignup({ ...valid, type: "" }).type).toBeDefined();
    expect(validateSignup({ ...valid, type: "agent" }).type).toBeDefined();
  });

  it("trims before measuring, so padding is not a way past the bounds", () => {
    expect(validateSignup({ ...valid, email: "  a@b.co  ", name: "  Ada  " })).toEqual({});
  });
});
