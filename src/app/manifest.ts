import type { MetadataRoute } from "next";

/**
 * The web app manifest (PRD 14's "PWA shell") — installable to the home
 * screen. `standalone` display and a start_url pointed at the fast path are
 * what make "open the app" feel like opening an app rather than a bookmark.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "whatsfordinner",
    short_name: "Dinner",
    description: "Three dinners, one decision, under a minute.",
    start_url: "/",
    display: "standalone",
    background_color: "#fbfaf8",
    theme_color: "#b4451f",
    orientation: "portrait",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
