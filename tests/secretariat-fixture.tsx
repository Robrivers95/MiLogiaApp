import React from "react";
import { createRoot } from "react-dom/client";
import Secretariat from "../components/SecretariatAdvanced";
import "../styles/temple.css";
const params = new URLSearchParams(location.search);
const user = {
  uid: params.get("owner") || "secretary-test",
  groupId: params.get("group") || "test",
  name: "Secretario",
  role: params.get("role") || "member",
  lodgeRole: params.has("denied") ? "sin_cargo" : "secretario",
  active: true,
} as any;
createRoot(document.getElementById("root")!).render(
  <Secretariat user={user} suspended={params.has("suspended")} />,
);
