"use client";

import { useFormStatus } from "react-dom";

export default function RefreshButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="refresh" disabled={pending}>
      {pending ? "更新中…" : "更新"}
    </button>
  );
}
