import type { Dispatch, SetStateAction } from "react";
import type { CampaignConfig } from "@abtest-solution/core";
import type { ConsentConfigApi } from "@/simulationUrl";

export type CampaignOutletContext = {
  campaign: CampaignConfig;
  setCampaign: Dispatch<SetStateAction<CampaignConfig | null>>;
  consentConfig: ConsentConfigApi | null;
};
