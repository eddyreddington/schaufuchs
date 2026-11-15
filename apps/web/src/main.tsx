import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { router } from "./routes";
import "./styles.css";
import { queryClient, trpc, trpcClient } from "./trpc";
import { FragenAnbieter, MeldungenAnbieter } from "./ui";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <MeldungenAnbieter>
          <FragenAnbieter>
            <RouterProvider router={router} />
          </FragenAnbieter>
        </MeldungenAnbieter>
      </QueryClientProvider>
    </trpc.Provider>
  </StrictMode>,
);
