import React from "react";
import { createRoot } from "react-dom/client";
import ElectionsPage from "./ElectionsPage";
import "./globals.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ElectionsPage />
  </React.StrictMode>,
);
