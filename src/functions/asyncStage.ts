/*!
 * Copyright 2017-2017 Mutual of Enumclaw. All Rights Reserved.
 * License: Public
 */

import { OrchestratorComponentState, OrchestratorStage, stepLambdaAsyncWrapper, OrchestratorStatusDal, 
    OrchestratorWorkflowStatus }
    from '@moe-tech/orchestrator';
import { SNSUtils } from '../utils/snsUtils';
import { install } from 'source-map-support';

install();

let sns: SNSUtils;
let dal: OrchestratorStatusDal;
let activity: string = process.env.activity;

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

export const fanOut = stepLambdaAsyncWrapper(async (event: OrchestratorWorkflowStatus) => {
    if (!sns || !dal) {
        sns = new SNSUtils(process.env.snsTopic);
        dal = new OrchestratorStatusDal(process.env.statusTable, activity);
    }

    if (!event) {
        throw new Error('Event data unexpected');
    }
    if (!event.uid) {
        throw new Error(`Event data unexpected (uid: '${event.uid}')`);
    }

    if (await sns.getSubscriberCount() === 0) {
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

    console.log('Setting activity state to in progress');
    dal.updateStageStatus(
        event.uid, event.workflow, activity, OrchestratorStage.BulkProcessing,
        OrchestratorComponentState.InProgress, ' ');

    return OrchestratorComponentState.InProgress;
});
