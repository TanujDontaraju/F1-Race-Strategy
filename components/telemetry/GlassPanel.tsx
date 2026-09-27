import { ComponentProps } from "react";

/** Large translucent surface; the material itself is defined in app/globals.css. */
export default function GlassPanel({ className = "", ...props }: ComponentProps<"section">) {
  return <section className={`glass-panel ${className}`} {...props} />;
}
