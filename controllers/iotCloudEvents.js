const debug = require('debug');
const log = debug('app-iotCloud-events:info');
const errorLog = debug('app-iotCloud-events:error');

const subscribersByVariableId = new Map();

const createClientId = () => {
    return `${Date.now()}-${Math.random().toString(36).substring(2)}`;
}

const variableEvents = async (req, res) => {
    try {
        const variableIdsParam = req.query.variableIds;

        if (!variableIdsParam || typeof variableIdsParam !== 'string') {
            return res.status(400).json({
                status: "Failed",
                error: "variableIds query parameter is required",
                message: {}
            });
        }

        const variableIds = variableIdsParam
            .split(',')
            .map((id) => id.trim())
            .filter((id) => id.length > 0);

        if (variableIds.length === 0) {
            return res.status(400).json({
                status: "Failed",
                error: "At least one variableId is required",
                message: {}
            });
        }

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        if (typeof res.flushHeaders === 'function') {
            res.flushHeaders();
        }

        const client = {
            id: createClientId(),
            res,
            variableIds
        };

        variableIds.forEach((variableId) => {
            let subscribers = subscribersByVariableId.get(variableId);

            if (!subscribers) {
                subscribers = new Set();
                subscribersByVariableId.set(variableId, subscribers);
            }

            subscribers.add(client);
        });

        res.write(`event: connected\n`);
        res.write(`data: ${JSON.stringify({status: "connected"})}\n\n`);

        const keepAlive = setInterval(() => {
            res.write(`: keep-alive\n\n`);
        }, 25000);

        req.on('close', () => {
            clearInterval(keepAlive);

            client.variableIds.forEach((variableId) => {
                const subscribers = subscribersByVariableId.get(variableId);

                if (subscribers) {
                    subscribers.delete(client);

                    if (subscribers.size === 0) {
                        subscribersByVariableId.delete(variableId);
                    }
                }
            });

            log(`SSE client disconnected: ${client.id}`);
        });

        log(`SSE client connected: ${client.id}`);
    }
    catch (err) {
        errorLog(err.toString());

        if (!res.headersSent) {
            return res.status(500).json({
                status: "Failed",
                error: err.toString(),
                message: {}
            });
        }

        res.end();
    }
}

const emitVariableUpdate = (payload) => {
    try {
        if (!payload || !payload.variableId) return;

        const variableId = payload.variableId.toString();
        const subscribers = subscribersByVariableId.get(variableId);

        if (!subscribers || subscribers.size === 0) return;

        const body =
            `event: variable-update\n` +
            `id: ${Date.now()}\n` +
            `data: ${JSON.stringify(payload)}\n\n`;

        subscribers.forEach((client) => {
            client.res.write(body);
        });
    }
    catch (err) {
        errorLog(err.toString());
    }
}

module.exports = {
    variableEvents,
    emitVariableUpdate
}