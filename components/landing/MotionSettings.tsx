"use client";
import { useState } from "react";
export default function MotionSettings() {
  const [paused, setPaused] = useState(false);
  return (
    <details className="vkw-display-settings">
      <summary>Pengaturan tampilan</summary>
      <label>
        <input
          type="checkbox"
          checked={paused}
          onChange={(e) => {
            setPaused(e.target.checked);
            window.dispatchEvent(
              new CustomEvent("vokasi-motion", {
                detail: { paused: e.target.checked },
              }),
            );
          }}
        />{" "}
        Nonaktifkan animasi otomatis
      </label>
    </details>
  );
}
