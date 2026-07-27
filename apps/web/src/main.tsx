import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Application } from "./application";
import { queryClient } from "./query-client";
import "./styles.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("The root application element was not found");
}

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <Application />
    </QueryClientProvider>
  </StrictMode>,
);
