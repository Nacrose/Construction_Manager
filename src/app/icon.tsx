import { ImageResponse } from "next/og";

export const size = {
  width: 32,
  height: 32,
};
export const contentType = "image/png";

/**
 * Ultra-sharp architectural contractor favicon.
 *
 * Designed with high-contrast isometric vector geometry that renders with
 * razor-sharp clarity in browser tabs (16×16, 32×32) and bookmarks.
 *
 * Geometric Structure:
 * - High-contrast obsidian slate tile with subtle chamfered corners.
 * - Bold architectural construction beam / monogram forming a structural "C" girder.
 * - Pure white upper facet (#ffffff), brushed steel side facet (#a1a1aa), and luminous precision vertex (#00ff66).
 */
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#080b10",
          borderRadius: "7px",
          border: "1px solid rgba(255, 255, 255, 0.2)",
          boxShadow: "0 0 10px rgba(0, 0, 0, 0.9)",
        }}
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Isometric Construction Monogram Beam Framework */}
          {/* Top Beam */}
          <path
            d="M4 6L12 2L20 6L12 10L4 6Z"
            fill="#FFFFFF"
          />
          {/* Left Pillar Face */}
          <path
            d="M4 6L12 10V21L4 17V6Z"
            fill="#71717A"
          />
          {/* Right Pillar Face */}
          <path
            d="M12 10L20 6V17L12 21V10Z"
            fill="#D4D4D8"
          />
          {/* Central Structural Cutout (Forms Contractor Girder Arch) */}
          <path
            d="M9 11L12 9.5L15 11V16.5L12 18L9 16.5V11Z"
            fill="#080B10"
          />
          {/* Luminous Precision Vertex Node */}
          <circle cx="12" cy="10" r="1.5" fill="#00FF66" />
        </svg>
      </div>
    ),
    {
      ...size,
    }
  );
}
