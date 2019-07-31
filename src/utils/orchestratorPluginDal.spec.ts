/*!
 * Copyright 2017-2017 Mutual of Enumclaw. All Rights Reserved.
 * License: Public
 */

import { OrchestratorPluginDal } from "./orchestratorPluginDal";
import { OrchestratorStage } from "@moe-tech/orchestrator";
import { MockDynamoDb } from '../../__mock__/mockDynamoDb';

const mockDb = new MockDynamoDb();

describe('getSyncPlugins', () => {
    const dal = new OrchestratorPluginDal('Test', 'Orch');
    (dal as any).dal = mockDb;

    test('stage not defined', async () => {
        let error = null;
        try {
            await dal.getSyncPlugins(null);
        } catch (err) {
            error = err.message;
        }
        expect(error).toBe('Argument stage not defined');
    });
    test('bulk processing', async () => {
        let error = null;
        try {
            await dal.getSyncPlugins(OrchestratorStage.BulkProcessing);
        } catch (err) {
            error = err.message;
        }
        expect(error).toBe('Bulk processing cannot get sync plugins');
    });
    test('dynamodb null', async () => {
        mockDb.queryReturn = null;
        const result = await dal.getSyncPlugins(OrchestratorStage.PreProcessing);
        expect(result).toMatchObject([]);
    });

    test('dynamodb empty', async () => {
        mockDb.queryReturn = [];
        const result = await dal.getSyncPlugins(OrchestratorStage.PostProcessing);
        expect(result).toMatchObject([]);
    });
    
    test('dynamodb out of order', async () => {
        mockDb.queryReturn = [
            {
                arn: 'test 2',
                order: 2
            },
            {
                arn: 'test 1',
                order: 1
            }
        ];
        const result = await dal.getSyncPlugins(OrchestratorStage.PreProcessing);
        expect(result).toBeDefined();
        expect(result).toMatchObject([
            {
                arn: 'test 1',
                order: 1
            },
            {
                arn: 'test 2',
                order: 2
            }
        ]);
    });
});
