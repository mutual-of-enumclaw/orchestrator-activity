/*!
 * Copyright 2017-2017 Mutual of Enumclaw. All Rights Reserved.
 * License: Public
 */

import { start, setStatusDal, setPluginDal, setLambda, setActivityId } from './syncStage';
import { OrchestratorStatusDal } from '../../__mock__/libServices';
import { MockLambda } from '../../__mock__/aws';
import { OrchestratorComponentState } from '@moe-tech/orchestrator';


const dal = new OrchestratorStatusDal();
const mockLambda = new MockLambda();
process.env.environment = 'unit-test';

describe('start test', () => {
    setStatusDal(dal as any);
    setPluginDal(dal as any);
    setLambda(mockLambda as any);
    setActivityId('test');
    test('', async () => {
        let error = null;
        try {
            await start(null);
        } catch (err) {
            error = err.message;
        }
        expect(error).toBe('Event data unexpected');
    });
    test('Missing uid', async () => {
        let error = null;
        const event = getDefaultEvent();
        event.uid = undefined;
        try {
            await start(event);
        } catch (err) {
            error = err.message;
        }

        expect(error).toBe("Event data unexpected (uid: 'undefined')");
    });
    test('No plugins', async () => {
        dal.reset();
        mockLambda.reset();
        const event = getDefaultEvent();
        await start(event);
    });

    test('Missing function name', async () => {
        dal.reset();
        mockLambda.reset();
        dal.getStatusObjectResult = {
            activities: {
                test: {
                    post: {
                        status: {
                            state: OrchestratorComponentState.Complete
                        }
                    }
                }
            }
        };
        dal.getSyncPluginsRetval = [
            { }
        ];
        const event = getDefaultEvent();
        let error = null;
        try {
            await start(event);
        } catch (err) {
            error = err.message;
        }

        expect(error).toBe(`Plugin does not have required values ${JSON.stringify({})}`);
    });

    test('No registered plugins', async () => {
        dal.reset();
        mockLambda.reset();

        const event = getDefaultEvent();
        await start(event);

        expect(mockLambda.invokeParams.length).toBe(0);
        expect(dal.updateStageStatusInput.state).toBe(OrchestratorComponentState.Complete);
    });

    test('Valid', async () => {
        dal.reset();
        mockLambda.reset();
        dal.getStatusObjectResult = {
            activities: {
                test: {
                    post: {
                        status: {
                            state: OrchestratorComponentState.Complete
                        }
                    }
                }
            }
        };
        dal.getSyncPluginsRetval = [
            {
                functionName: 'test',
                pluginName: 'test',
                mandatory: true,
                order: 1
            }
        ];
        const event = getDefaultEvent();
        await start(event);
    });

    test('Lambda Exception Thrown', async () => {
        dal.reset();
        mockLambda.reset();
        mockLambda.invokeRetval = { FunctionError: 'This is an error' };
        dal.getStatusObjectResult = {
            activities: {
                test: {
                    post: {
                        status: {
                            state: OrchestratorComponentState.Complete
                        }
                    }
                }
            }
        };
        dal.getSyncPluginsRetval = [
            {
                functionName: 'test',
                pluginName: 'test',
                mandatory: true,
                order: 1
            }
        ];
        const event = getDefaultEvent();
        let error = null;
        try {
            await start(event);
        } catch (err) {
            error = err.message;
        }

        expect(error).toBe('This is an error');
        expect(dal.updateStageStatusInput.state).toBe(OrchestratorComponentState.Error);
        expect(dal.updatePluginStatusInput.state).toBe(OrchestratorComponentState.Error);
        expect(dal.updateStageStatusInput.message).toBe('This is an error');
    });
});

describe('setActivityId', () => {
    process.env.environment = 'test';
    test('Invalid environment', () => {
        let error = null;
        try {
            setActivityId('test');
        } catch (err) {
            error = err.message;
        }
        expect(error).toBe('A unit test modification is being used outside of the indended environment');
    });
});

describe('setStatusDal', () => {
    process.env.environment = 'test';
    test('Invalid environment', () => {
        let error = null;
        try {
            setStatusDal({} as any);
        } catch (err) {
            error = err.message;
        }
        expect(error).toBe('A unit test modification is being used outside of the indended environment');
    });
});

describe('setPluginDal', () => {
    process.env.environment = 'test';
    test('Invalid environment', () => {
        let error = null;
        try {
            setPluginDal({} as any);
        } catch (err) {
            error = err.message;
        }
        expect(error).toBe('A unit test modification is being used outside of the indended environment');
    });
});

describe('setMakeLambdaCall', () => {
    process.env.environment = 'test';
    test('Invalid environment', () => {
        let error = null;
        try {
            setLambda({} as any);
        } catch (err) {
            error = err.message;
        }
        expect(error).toBe('A unit test modification is being used outside of the indended environment');
    });
});

function getDefaultEvent() {
    return {
        uid: 'uid', company: 'company', lineOfBusiness: 'lob', riskState: 'state',
        effectiveDate: 1, policies: [{ id: 'test' }], workflow: 'test', metadata: {
            workflow: 'issue'
        }
    };
}
