import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthError } from "./api/client";
import App from "./App";
import "./index.css";
import "./lib/pwa"; // start listening for the install prompt as early as possible

// Any request that comes back 401 (session expired, password reset) re-checks
// who's signed in, which drops the app back to the sign-in screen.
const queryClient: QueryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (err) => {
      if (err instanceof AuthError) queryClient.setQueryData(["me"], null);
    },
  }),
  defaultOptions: {
    queries: { retry: (count, err) => !(err instanceof AuthError) && count < 2 },
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);

// Service worker: lets players add the app to their home screen and receive
// the morning check-in reminder.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((err) => console.warn("Service worker registration failed", err));
  });
}
