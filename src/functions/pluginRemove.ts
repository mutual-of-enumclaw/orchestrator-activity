/*!
 * Copyright 2017-2017 Mutual of Enumclaw. All Rights Reserved.
 * License: Public
 */

import { CloudwatchEvent } from "../types/cloudwatchEvent";
import { OrchestratorStage, lambdaWrapperAsync } from "@moe-tech/orchestrator";
import { PluginManager } from "../utils/pluginManager";

const stage = (process.env.stage === 'pre')? OrchestratorStage.PreProcessing : OrchestratorStage.PostProcessing;
const pluginRemoveManager = new PluginManager(process.env.activity, stage, process.env.snsArn);
export const handler = lambdaWrapperAsync(async (event: CloudwatchEvent) => {
    console.log(JSON.stringify(event));
    await pluginRemoveManager.removePluginEvent(event);
});
