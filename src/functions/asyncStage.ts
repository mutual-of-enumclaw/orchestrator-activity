/*!
 * Copyright 2017-2017 Mutual of Enumclaw. All Rights Reserved.
 * License: Public
 */

import { OrchestratorComponentState, OrchestratorStage, stepLambdaAsyncWrapper, OrchestratorStatusDal, 
    OrchestratorWorkflowStatus, getPluginRegisterTimeout }
    from '@moe-tech/orchestrator';
import { SNSUtils } from '../utils/snsUtils';
import { install } from 'source-map-support';
import { StepFunctions } from 'aws-sdk';

install();

let sns: SNSUtils;
let dal: OrchestratorStatusDal;
let stepfunctions = new StepFunctions();
let activity: string = process.env.activity;

export function setStepFunction(value: StepFunctions) {
    if (process.env.environment !== 'unit-test') {
        throw new Error('A unit test modification is being used outside of the indended environment');
    }
    stepfunctions = value;
}

export function setActivityId(obj: string) {
    if (process.env.environment !== 'unit-test') {
        throw new Error('A unit test modification is being used outside of the indended environment');
    }
    activity = obj;
}

export function setSns(obj: SNSUtils) {
    if (process.env.environment !== 'unit-test') {
        throw new Error('A unit test modification is being used outside of the indended environment');
    }
    sns = obj;
}

export function setDal(obj: OrchestratorStatusDal) {
    if (process.env.environment !== 'unit-test') {
        throw new Error('A unit test modification is being used outside of the indended environment');
    }
    dal = obj;
}

interface AsyncParameters {
    data: OrchestratorWorkflowStatus,
    asyncToken: string
}

export const fanOut = stepLambdaAsyncWrapper(async (asyncEvent: AsyncParameters) => {
    if (!sns || !dal) {
        sns = new SNSUtils(process.env.snsTopic);
        dal = new OrchestratorStatusDal(process.env.statusTable, activity);
    }
    
    if(!asyncEvent || !asyncEvent.asyncToken || !asyncEvent.data) {
        throw new Error('Async event data not recieved');
    }

    const event = asyncEvent.data;
    if (!event) {
        throw new Error('Event data unexpected');
    }
    if (!event.uid) {
        throw new Error(`Event data unexpected (uid: '${event.uid}')`);
    }

    if (await sns.getSubscriberCount() === 0) {
        console.log('No subscribers, updating status and returning');
        await stepfunctions.sendTaskSuccess({
            output: JSON.stringify(OrchestratorComponentState.Complete),
            taskToken: asyncEvent.asyncToken
        }).promise();

        await dal.updateStageStatus(
            event.uid, event.workflow, activity, OrchestratorStage.BulkProcessing,
            OrchestratorComponentState.Complete, ' ');

        return OrchestratorComponentState.Complete;
    }

    console.log('Retrieving status object');
    const overallStatus = await dal.getStatusObject(event.uid, event.metadata.workflow);

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

    console.log('Setting activity state to in progress');
    const startTime = new Date();
    await dal.updateStageStatus(
        event.uid, event.workflow, activity, OrchestratorStage.BulkProcessing,
        OrchestratorComponentState.InProgress, ' ', startTime, asyncEvent.asyncToken);

    const result = await sns.publishWithMetadata(
        {
            orchestratorId: process.env.orchestratorId,
            status: overallStatus.status,
            activity,
            activities: statusObject,
            stage: OrchestratorStage.BulkProcessing,
            ...globalMetadata
        },
        globalMetadata);
    console.log(`publishWithMetadata result: ${JSON.stringify(result)}`);

    const timeout = getPluginRegisterTimeout(overallStatus, activity);
    await new Promise((resolve) => {
        setTimeout(
            () => {
                resolve();
            }, 
            timeout);
    });

    const updatedStatus = await dal.getStatusObject(event.uid, event.workflow, true);

    if(Object.keys(updatedStatus.activities[activity].async.mandatory).length === 0) {
        console.log('No plugins registered, performing update to move task forward');
        await dal.updateStageStatus(
            event.uid, event.workflow, activity, OrchestratorStage.BulkProcessing,
            OrchestratorComponentState.Complete, ' ', startTime, ' ');
        await stepfunctions.sendTaskSuccess({
            output: JSON.stringify(OrchestratorComponentState.Complete),
            taskToken: asyncEvent.asyncToken
        }).promise();
    }

    return OrchestratorComponentState.InProgress;
});
