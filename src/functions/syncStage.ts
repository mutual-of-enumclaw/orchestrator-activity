/*!
 * Copyright 2017-2017 Mutual of Enumclaw. All Rights Reserved.
 * License: Public
 */

import { stepLambdaAsyncWrapper, OrchestratorWorkflowStatus, 
    OrchestratorStatusDal, OrchestratorStage, OrchestratorComponentState } from '@moe-tech/orchestrator';
import { OrchestratorPluginDal } from '../utils/orchestratorPluginDal';
import * as AWS from 'aws-sdk';

let statusDal: OrchestratorStatusDal = null;
let pluginDal: OrchestratorPluginDal = null;
let activity: string = process.env.activity;
const stage = (process.env.stage === 'pre') ? OrchestratorStage.PreProcessing : OrchestratorStage.PostProcessing;
let lambda = new AWS.Lambda();

export function setActivityId(obj: string) {
    if (process.env.environment !== 'unit-test') {
        throw new Error('A unit test modification is being used outside of the indended environment');
    }
    activity = obj;
}
export function setStatusDal(obj: OrchestratorStatusDal) {
    if (process.env.environment !== 'unit-test') {
        throw new Error('A unit test modification is being used outside of the indended environment');
    }
    statusDal = obj;
}
export function setPluginDal(obj: OrchestratorPluginDal) {
    if (process.env.environment !== 'unit-test') {
        throw new Error('A unit test modification is being used outside of the indended environment');
    }
    pluginDal = obj;
}

export function setLambda(obj: AWS.Lambda) {
    if (process.env.environment !== 'unit-test') {
        throw new Error('A unit test modification is being used outside of the indended environment');
    }
    lambda = obj;
}

export const start = stepLambdaAsyncWrapper(async (event: OrchestratorWorkflowStatus) => {
    if (!statusDal) {
        statusDal = new OrchestratorStatusDal(process.env.statusTable);
        pluginDal = new OrchestratorPluginDal(process.env.pluginTable, activity);
    }
    console.log(JSON.stringify(event));
    if (!event) {
        throw new Error('Event data unexpected');
    }
    if (!event.workflow) {
        throw new Error(`Event data unexpected (workflow: '${event.workflow}')`);
    }
    if (!event.uid) {
        throw new Error(`Event data unexpected (uid: '${event.uid}')`);
    }

    await statusDal.updateStageStatus(event.uid, event.workflow, activity, stage, 
                                      OrchestratorComponentState.InProgress, ' ');

    console.log('Retrieving registered plugins');
    const plugins = await pluginDal.getSyncPlugins(stage);
    if(!plugins || plugins.length === 0) {
        statusDal.updateStageStatus(event.uid, event.workflow, activity, stage, 
                                    OrchestratorComponentState.Complete, ' ');
        return;
    }

    console.log(`Retrieved plugins (${plugins ? plugins.length : 0})`);

    try {
        //
        // Register plugins as not started
        //
        await Promise.all(plugins.map(item => {
            return statusDal.updatePluginStatus(
                event.uid, event.workflow,
                activity, stage, item.mandatory, item.pluginName, 
                OrchestratorComponentState.NotStarted, ' ');
        }));

        //
        // Execute all
        //
        
        console.log('Retrieving status object');
        const overallStatus = await statusDal.getStatusObject(event.uid, event.metadata.workflow);

        if (!overallStatus) {
            throw new Error('The status object cannot be found');
        }

        if (!overallStatus.activities[activity]) {
            throw new Error('The orchistration id has not been provisioned');
        }
        const statusObject = {};
        statusObject[activity] = overallStatus.activities[activity];

        const globalMetadata = {
            now: new Date().getTime(),
            ...event.metadata,
            uid: event.uid
        } as any;
        const message = {
            orchestratorId: process.env.orchestratorId,
            status: overallStatus.status,
            activity,
            activities: statusObject,
            stage,
            ...globalMetadata
        };
        const snsMessage = {
            Records: [{
                Sns: {
                    Message: JSON.stringify(message)
                }
            }]
        };
        for (const i in plugins) {
            const plugin = plugins[i];
            if (!plugin) {
                continue;
            }
            if (!plugin.functionName) {
                throw new Error(`Plugin does not have required values ${JSON.stringify(plugin)}`);
            }

            console.log('Calling plugin ' + plugin.functionName);
            if(process.env.debugInput === 'true') {
                console.log(JSON.stringify(snsMessage));
            }
            
            let retryCount = -1;
            let error = null;
            do {
                error = null;
                retryCount++;
                try {
                    const result = await lambda.invoke({
                        FunctionName: plugin.functionName,
                        Payload: JSON.stringify(snsMessage)
                    }).promise();

                    if (result.FunctionError) {
                        throw new Error(result.FunctionError as string);
                    }
                } catch (err) {
                    error = err;
                    await new Promise((resolve) => {
                        setTimeout(
                            () => {
                                resolve();
                            }, 
                            1000);
                    });
                }
            } while (error != null && retryCount < 3);
            if(error) {
                await statusDal.updatePluginStatus(
                                             event.uid, event.workflow, activity, stage,
                                             plugin.mandatory, plugin.pluginName, 
                                             OrchestratorComponentState.Error,
                                             error.message);
                await statusDal.updateStageStatus(
                                            event.uid, event.workflow, activity, stage, 
                                            OrchestratorComponentState.Error, error.message);
                throw error;
            }
            console.log('Completed plugin ' + plugin.functionName);
        }
        console.log('Getting plugin status');
        let status = await statusDal.getStatusObject(event.uid, event.workflow);
        // if we are in error.. throw.. we are done
        if(status.activities[activity][stage].status.state === OrchestratorComponentState.Error){
            throw new Error(`The status of the stage does not comply with moving to next stage `
            + status.activities[activity][stage].status.state);
        }
        if(status.activities[activity][stage].status.state === OrchestratorComponentState.InProgress) {
           // we are still in progress so retry up to 3 times
           let statusRetryCount = -1;
           let statusError = null;
           do {
                statusError = null;
               statusRetryCount++;
               try {
                    status = await statusDal.getStatusObject(event.uid, event.workflow);

               } catch (err) {
                statusError = err;
                   await new Promise((resolve) => {
                       setTimeout(
                           () => {
                               resolve();
                           }, 
                           1000);
                   });
               }
           } while (statusError != null && statusRetryCount < 3);
           if(statusError) {
            throw new Error(`The status of the stage does not comply with moving to next stage `
            + status.activities[activity][stage].status.state);               
           }
        }

        return {};
    } catch (err) {
        // console.log('An error occured', err);
        throw err;
    }
});
