// Placeholder for an actual screenshot. When real PNGs land at
// public/setup/<name>.png, swap the dashed-border block for a
// next/image tag pointing at /setup/<name>.png — see the README at the
// bottom of components/wizard for the filename convention.

import Image from "next/image";

interface Props {
  /** Path under /public/setup/ — e.g. "step-2-meta-developer.png".
   * When this file exists in /public, the real image is rendered;
   * otherwise the dashed placeholder shows so the wizard still flows. */
  src?: string;
  description: string;
  /** Approximate aspect — defaults to a wide landscape ratio that
   * matches the Meta dashboard screenshots. */
  aspect?: "wide" | "square";
}

export function ScreenshotPlaceholder({ src, description, aspect = "wide" }: Props) {
  const aspectClass = aspect === "square" ? "aspect-square" : "aspect-[16/9]";
  if (src) {
    return (
      <figure className={`relative w-full ${aspectClass} rounded-lg overflow-hidden border border-zinc-200 bg-zinc-50`}>
        <Image
          src={`/setup/${src}`}
          alt={description}
          fill
          className="object-contain"
        />
        <figcaption className="sr-only">{description}</figcaption>
      </figure>
    );
  }
  return (
    <div
      className={`w-full ${aspectClass} rounded-lg border-2 border-dashed border-zinc-300 bg-zinc-50 flex flex-col items-center justify-center p-6 text-center`}
      role="img"
      aria-label={description}
    >
      <p className="text-sm font-medium text-zinc-600">📸 Screenshot: {description}</p>
      <p className="text-xs text-zinc-400 mt-1">
        Replace with actual screenshot image
      </p>
    </div>
  );
}
