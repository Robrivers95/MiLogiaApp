import React from "react";
import { createRoot } from "react-dom/client";
import CaptureAssistant from "../components/CaptureAssistant";
import QuickFinance from "../components/QuickFinance";
import "../styles/temple.css";
const params = new URLSearchParams(location.search);
const user = {
  uid: params.get("owner") || "member",
  name: "Miembro",
  role: params.get("role") || "member",
  active: true,
  groupId: "lodge",
} as any;
createRoot(document.getElementById("root")!).render(
  <main className="max-w-4xl mx-auto">
    <CaptureAssistant user={user} suspended={params.has("suspended")} />
    <QuickFinance user={user} suspended={params.has("suspended")} />
  </main>,
);
