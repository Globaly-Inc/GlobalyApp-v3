"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { SectionError } from "./section-error";

/**
 * Contains a render error to one region of Home.
 *
 * Without this, a single bad field in one card throws during render and React unmounts the entire page —
 * "Something went wrong" instead of a hero, a feed and the other cards. The API layer normalizes responses
 * so this should not trigger, but "should not" is not a guarantee, and Home's whole contract is that one
 * broken region does not take the others down.
 *
 * A class component because there is still no hook equivalent for componentDidCatch.
 */
export class RegionBoundary extends Component<
  { children: ReactNode; label: string },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Kept visible in dev; a real logger belongs here once one exists on the client.
    console.error(`[${this.props.label}] region crashed`, error, info.componentStack);
  }

  render() {
    if (this.state.failed) {
      return (
        <SectionError
          message={`Couldn't display ${this.props.label}.`}
          onRetry={() => this.setState({ failed: false })}
        />
      );
    }
    return this.props.children;
  }
}
