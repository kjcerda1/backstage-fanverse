import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { initTelemetry } from "./lib/telemetry.js";

// Before render, so Sentry catches errors thrown during the first paint.
// No-ops when VITE_SENTRY_DSN / VITE_POSTHOG_KEY are unset.
initTelemetry();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
