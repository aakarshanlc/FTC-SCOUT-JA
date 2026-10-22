"use client";

import { useEffect, useRef, useState } from "react";
import { useScout } from "./ScoutProvider";

/**
 * Floating "i" button (bottom right) that opens the FTCScout status panel:
 * each API load result or error the app has recorded, newest sources last.
 * Closes on a click anywhere outside it, or on Escape.
 */
export default function ApiInfo() {
  const { apiRows } = useScout();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && e.target instanceof Node && rootRef.current.contains(e.target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("click", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const hasErr = apiRows.some((r) => r.error);

  return (
    <div id="apiinfo" ref={rootRef} className={hasErr ? "has-err" : undefined}>
      <div id="apipanel" hidden={!open}>
        <h4>FTCScout</h4>
        {apiRows.length ? (
          apiRows.map((r) => (
            <div key={r.key} className={r.error ? "row err" : "row"}>
              {r.text}
            </div>
          ))
        ) : (
          <div className="row">No FTCScout status yet.</div>
        )}
      </div>
      <button
        id="infobtn"
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="FTCScout status"
        aria-label="FTCScout status"
        aria-expanded={open}
      >
        i
      </button>
    </div>
  );
}
