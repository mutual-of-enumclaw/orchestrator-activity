/*!
 * Copyright 2017-2017 Mutual of Enumclaw. All Rights Reserved.
 * License: Public
 */

import { OrchestratorStage, OrchestratorSyncPlugin } from "@moe-tech/orchestrator";
import * as AWS from 'aws-sdk';

export class OrchestratorPluginDal {
    private dal: AWS.DynamoDB.DocumentClient = new AWS.DynamoDB.DocumentClient();
    constructor(private pluginTable: string, private orchestratorId: string) {
    }

    public async getSyncPlugins(stage: OrchestratorStage) : Promise<Array<OrchestratorSyncPlugin>> {
        if(stage === null || stage === undefined) {
            throw new Error('Argument stage not defined');
        }
        if(stage === OrchestratorStage.BulkProcessing) {
            throw new Error('Bulk processing cannot get sync plugins');
        }
        const results = await this.dal.query(
            {
                TableName: this.pluginTable,
                ExpressionAttributeValues: {
                    ":id": `${this.orchestratorId}|${stage}`
                }, 
                KeyConditionExpression: "orchestratorId = :id" 
            }).promise();

        if(results == null || !results.Items || results.Items.length === 0) {
            return [];
        }
        results.Items.sort((a, b) => { return a.order - b.order; });
        return results.Items as OrchestratorSyncPlugin[];
    }
}
