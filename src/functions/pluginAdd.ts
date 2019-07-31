/*!
 * Copyright 2017-2017 Mutual of Enumclaw. All Rights Reserved.
 * License: Public
 */

import { CloudwatchEvent } from '../types/cloudwatchEvent';
import { lambdaWrapperAsync, OrchestratorStage } from '@moe-tech/orchestrator';
import { PluginManager } from '../utils/pluginManager';
import { install } from 'source-map-support';

install();

const stage = (process.env.stage === 'pre')? OrchestratorStage.PreProcessing : OrchestratorStage.PostProcessing;
const pluginManager = new PluginManager(process.env.activity, stage, process.env.snsArn);
export const handler = lambdaWrapperAsync(async (event: CloudwatchEvent) => {
    console.log(JSON.stringify(event));
    await pluginManager.addPluginEvent(event);
});
