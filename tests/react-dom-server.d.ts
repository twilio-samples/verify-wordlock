// The page tests render to HTML. The repo has no @types/react-dom, and adding
// it moves Paste's peer types to React 19, so this declares the one call used.
declare module "react-dom/server" {
  import type { ReactNode } from "react";
  export function renderToStaticMarkup(node: ReactNode): string;
}
