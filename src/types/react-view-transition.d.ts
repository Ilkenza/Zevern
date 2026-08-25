/**
 * `<ViewTransition>` exists at runtime and not in the types.
 *
 * Enabling `experimental.viewTransition` moves the app onto the React canary channel
 * that Next bundles (19.3.0-canary at the time of writing), which exports the
 * component. `@types/react` tracks the stable release, which does not — so without
 * this file the import is a type error against a function that is demonstrably there.
 *
 * The alternative was an `as any` at the import, which would have hidden the prop
 * shape as well as the gap. This declares the surface the app actually uses, so
 * passing a wrong `enter` map is still caught.
 *
 * Delete this once `@types/react` ships the component.
 */
import type { ReactNode } from "react";

/**
 * A class name for the transition, or a map from transition type to class name.
 * The `default` key covers navigations that carry no type of their own.
 */
type ViewTransitionClass = string | Record<string, string>;

declare module "react" {
  interface ViewTransitionProps {
    children: ReactNode;
    /** Identity across routes: matching names on two pages morph into one another. */
    name?: string;
    /** Applied when the element is added by the transition. */
    enter?: ViewTransitionClass;
    /** Applied when the element is removed by the transition. */
    exit?: ViewTransitionClass;
    /** Applied when an element with this name exists on both sides. */
    share?: ViewTransitionClass;
    /** Applied when the element persists and only its contents changed. */
    update?: ViewTransitionClass;
    /** The fallback for any of the above that is not given. `"none"` opts out. */
    default?: ViewTransitionClass;
  }

  export const ViewTransition: (props: ViewTransitionProps) => ReactNode;

  /**
   * Tags the transition currently being started, so a `ViewTransition` further up the
   * tree can pick a direction. `<Link transitionTypes>` calls this for us.
   */
  export function addTransitionType(type: string): void;
}
