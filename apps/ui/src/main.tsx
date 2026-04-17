import React from "react";
import ReactDOM from "react-dom/client";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
} from "react-router-dom";
import { HomePage } from "@/pages/HomePage";
import { CampaignListPage } from "@/pages/CampaignListPage";
import { CampaignLayout } from "@/pages/campaign/CampaignLayout";
import { CampaignGeneralPage } from "@/pages/campaign/CampaignGeneralPage";
import { CampaignTargetingPage } from "@/pages/campaign/CampaignTargetingPage";
import { CampaignVariationsPage } from "@/pages/campaign/CampaignVariationsPage";
import { CampaignDevelopmentPage } from "@/pages/campaign/CampaignDevelopmentPage";
import { SegmentListPage } from "@/pages/SegmentListPage";
import { ConfigurationPage } from "@/pages/ConfigurationPage";
import { Layout } from "@/ui/Layout";
import { ThemeProvider } from "@/theme/ThemeContext";

const rootElement = document.getElementById("root")!;

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <ThemeProvider>
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/campaigns" element={<CampaignListPage />} />
          <Route path="/campaigns/:id" element={<CampaignLayout />}>
            <Route index element={<CampaignGeneralPage />} />
            <Route path="allocation" element={<CampaignTargetingPage />} />
            <Route
              path="ciblage"
              element={<Navigate to="../allocation" replace />}
            />
            <Route path="variations" element={<CampaignVariationsPage />} />
            <Route path="developpement" element={<CampaignDevelopmentPage />} />
          </Route>
          <Route path="/segments" element={<SegmentListPage />} />
          <Route path="/configuration" element={<ConfigurationPage />} />
        </Route>
        <Route path="/consent" element={<Navigate to="/configuration" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
    </ThemeProvider>
  </React.StrictMode>,
);

