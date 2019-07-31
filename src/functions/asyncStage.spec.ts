/*!
 * Copyright 2017-2017 Mutual of Enumclaw. All Rights Reserved.
 * License: Public
 */

import { fanOut, setDal, setSns, setActivityId } from './asyncStage';
import { MockSNSUtils, OrchestratorStatusDal } from '../../__mock__/libServices';
import { OrchestratorComponentState } from '@moe-tech/orchestrator';


const sns = new MockSNSUtils();
const dal = new OrchestratorStatusDal();

describe('fanOut', () => {
    process.env.environment = 'unit-test';
    setActivityId('test');
    setDal(dal as any);
    setSns(sns as any);
    test('Null Event', async () => {
        let error = null;
        try {
            await fanOut(null);
        } catch (err) {
            error = err.message;
        }

        expect(error).toBe('Event data unexpected');
    });
    test('No uid', async () => {
        let error = null;
        try {
            await fanOut({});
        } catch (err) {
            error = err.message;
        }

        expect(error).toBe("Event data unexpected (uid: 'undefined')");
    });
    test('SNS Subscription is 0', async () => {
        sns.reset();
        dal.reset();
        sns.subscriberCount = 0;
        const result = await fanOut(getDefaultEvent());

        expect(result).toBe(OrchestratorComponentState.Complete);
        expect(dal.getStatusObjectInput).toBeDefined();
    });
    test('SNS Subscription is 1', async () => {
        sns.reset();
        dal.reset();
        sns.subscriberCount = 1;
        dal.getStatusObjectResult = {
            activities: {
                test: {}
            }
        };
        const result = await fanOut(getDefaultEvent());

        expect(result).toBe(OrchestratorComponentState.InProgress);
        expect(dal.getStatusObjectInput).toBeDefined();
    });
    test('No Overall Status Object', async () => {
        sns.reset();
        dal.reset();
        dal.getStatusObjectResult = null;
        let error = null;
        try {
            await fanOut(getDefaultEvent());
        } catch (err) {
            error = err.message;
        }
        expect(error).toBe('The status object cannot be found');
    });
    test('No Sub-Status Object', async () => {
        sns.reset();
        dal.reset();
        dal.getStatusObjectResult = {
            activities: {}
        };
        let error = null;
        try {
            await fanOut(getDefaultEvent());
        } catch (err) {
            error = err.message;
        }
        expect(error).toBe('The orchistration id has not been provisioned');
    });
});

function getDefaultEvent() {
    return {
        uid: 'uid', workflow: 'issue', company: 'company', lineOfBusiness: 'lob', riskState: 'state',
        effectiveDate: 1, policies: [{ id: 'test' }], metadata: {
            workflow: 'issue'
        }
    };
}

describe('setOrchestratorId', () => {
    process.env.environment = 'test';
    test('Invalid Environment', () => {
        let error = null;
        try {
            setActivityId('test');
        } catch (err) {
            error = err.message;
        }
        expect(error).toBe('A unit test modification is being used outside of the indended environment');
    });
});

describe('setDal', () => {
    process.env.environment = 'test';
    test('Invalid Environment', () => {
        let error = null;
        try {
            setDal({} as any);
        } catch (err) {
            error = err.message;
        }
        expect(error).toBe('A unit test modification is being used outside of the indended environment');
    });
});

describe('setSns', () => {
    process.env.environment = 'test';
    test('Invalid Environment', () => {
        let error = null;
        try {
            setSns({} as any);
        } catch (err) {
            error = err.message;
        }
        expect(error).toBe('A unit test modification is being used outside of the indended environment');
    });
});
