import React from "react";
import { createRoot } from "react-dom/client";
import Secretariat from "../components/Secretariat";
import "../styles/temple.css";
const params = new URLSearchParams(location.search);
const user = {
  uid: params.get("owner") || "secretary-test",
  groupId: "test",
  name: "Secretario",
  role: "member",
  lodgeRole: "secretario",
  active: true,
} as any;
createRoot(document.getElementById("root")!).render(
  <>
    <header className="h-14 bg-logia-800 p-4">Mi Logia</header>
    <main className="max-w-4xl mx-auto pb-20">
      <Secretariat user={user} />
    </main>
    <nav className="fixed bottom-0 left-0 right-0 h-16 bg-logia-800 border-t border-logia-700 flex justify-around items-center">
      <span>Inicio</span>
      <span>Comunidad</span>
      <span>Gestionar</span>
    </nav>
  </>,
);
