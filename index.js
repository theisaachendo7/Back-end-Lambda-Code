const AWS = require('aws-sdk');


const ENDPOINT = 'https://9339abnv59.execute-api.us-west-1.amazonaws.com/production';
const client = new AWS.ApiGatewayManagementApi({ endpoint: ENDPOINT });
const connections = {};


const sendToOne = async (id, body) => {
    try {
        await client.postToConnection({
            ConnectionId: id,
            Data: Buffer.from(JSON.stringify(body)),
        }).promise();
        console.log(`Message sent to connection ID ${id}`);
    } catch (err) {
        console.error(`Error sending to connection ID ${id}:`, err);
        if (err.statusCode === 410) { // Handle stale connections
            console.log(`Connection ID ${id} is stale and will be removed.`);
            delete connections[id];
        }
    }
};


const sendToAll = async (body) => {
    await Promise.all(Object.keys(connections).map(id => sendToOne(id, body)));
};


exports.handler = async (event) => {
    if (!event.requestContext) {
        return { statusCode: 400, body: 'Invalid request context' };
    }

    const { connectionId, routeKey } = event.requestContext;
    console.log(`Received ${routeKey} from ${connectionId}`);

   
    let body;
    try {
        body = event.body ? JSON.parse(event.body) : {};
    } catch (err) {
        console.error('Error parsing JSON:', err);
        return { statusCode: 400, body: JSON.stringify('Bad request: Error parsing JSON') };
    }

    
    switch (routeKey) {
        case '$connect':
            console.log('Connection added:', connectionId);
            break;
        case '$disconnect':
            if (connections[connectionId]) {
                await sendToAll({ systemMessage: `${connections[connectionId]} has left the chat` });
                delete connections[connectionId];
                await sendToAll({ members: Object.values(connections) });
                console.log('Connection removed:', connectionId);
            }
            break;
        case 'setName':
            connections[connectionId] = body.name;
            await sendToAll({ members: Object.values(connections) });
            await sendToAll({ systemMessage: `${body.name} has joined the chat` });
            break;
        case 'sendPublic':
            await sendToAll({ publicMessage: `${connections[connectionId]}: ${body.message}` });
            break;
        case 'sendPrivate':
            const recipientId = Object.keys(connections).find(key => connections[key] === body.to);
            if (recipientId) {
                await sendToOne(recipientId, { privateMessage: `${connections[connectionId]}: ${body.message}` });
            }
            break;
        default:
            console.log('Unknown routeKey:', routeKey);
            return { statusCode: 404, body: JSON.stringify('Route not found') };
    }

    return { statusCode: 200, body: JSON.stringify('Hello from Lambda!') };
};
