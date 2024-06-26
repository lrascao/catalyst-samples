import express from 'express';
import bodyParser from 'body-parser';
import axios from "axios";
import { DaprClient, CommunicationProtocolEnum} from "@dapr/dapr";

const daprApiToken = process.env.DAPR_API_TOKEN || "";
const daprHttpEndpoint = process.env.DAPR_HTTP_ENDPOINT || "http://localhost";
const pubSubName = process.env.PUBSUB_NAME || "pubsub"; 
const kvName = process.env.KVSTORE_NAME || "kvstore"; 
const invokeTargetAppID = process.env.INVOKE_APPID || "target"; 

const app = express()

const client = new DaprClient({daprApiToken: daprApiToken, communicationProtocol: CommunicationProtocolEnum.HTTP});

app.use(bodyParser.json({ type: '*/*' })) 

// Check if process.env.PORT is set
let appPort;
if (process.env.PORT) {
  appPort = parseInt(process.env.PORT);
} else {
  appPort = 5003
  console.warn("Warning: PORT environment variable not set for app. Defaulting to port", appPort);
  console.warn("Note: Using the default port for multiple apps will cause port conflicts.")
  // TODO: we could add a check if port is available, otherwise use a random port...
}

//#region Pub/Sub API

app.post('/pubsub/orders', async function (req, res) {
    let order = req.body
    try {
      await client.pubsub.publish(pubSubName, "orders", order);
      console.log("Published data: " + order.orderId);
      res.sendStatus(200);
    } catch (error){
      console.log("Error publishing order: " + order.orderId);
      res.status(500).send(error);
    }
});

app.post('/pubsub/neworders', (req, res) => {
  console.log("Order received: " + JSON.stringify(req.body.data))
  res.sendStatus(200);
});

//#endregion

//#region Request/Reply API 

app.post('/invoke/orders', async function (req, res) {
  let config = {
    headers: {
        "dapr-app-id": invokeTargetAppID,
        "dapr-api-token": daprApiToken
    }
  };
  let order = req.body
  
  try {
    await axios.post(`${daprHttpEndpoint}/invoke/neworders`, order, config);
    console.log("Invocation successful with status code: %d ", res.statusCode);
    res.sendStatus(200);
  } catch (error){
    console.log("Error invoking app at " + `${daprHttpEndpoint}/invoke/neworders`);
    res.status(500).send(error);
  }

});

app.post('/invoke/neworders', (req, res) => {
  console.log("Request received: %s", JSON.stringify(req.body))
  res.sendStatus(200);
});

//#endregion

//#region Key/Value API

app.post('/kv/orders', async function (req, res) {
  req.accepts('application/json')

  const keyName = "order" + req.body.orderId
  const state = [
    {
      key: keyName,
      value: req.body
    }]

  try {
    await client.state.save(kvName, state);
    console.log("Order saved successfully: " + req.body.orderId);
    res.sendStatus(200);
  } catch (error) {
    console.log("Error saving order: " + req.body.orderId);
    res.status(500).send(error);
  }
});

app.get('/kv/orders/:orderId', async function (req, res) {
  const keyName = "order" + req.params.orderId
  try {
    const order = await client.state.get(kvName, keyName)
    console.log("Retrieved order: ", order)
    res.json(order)
  } catch (error) {
    console.log("Error retrieving order: " + req.params.orderId);
    res.status(500).send(error);
  }
});

app.delete('/kv/orders/:orderId', async function (req, res) {
  const keyName = "order" + req.params.orderId
  try {
    await client.state.delete(kvName, keyName)
    console.log("Deleted order: ", req.params.orderId)
    res.sendStatus(200);
  } catch (error) {
    console.log("Error deleting order: " + req.params.orderId);
    res.status(500).send(error);
  }
});

//#endregion

app.listen(appPort, () => console.log(`server listening at :${appPort}`));