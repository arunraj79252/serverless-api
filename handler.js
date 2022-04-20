const AWS = require("aws-sdk");
const express = require("express");
const serverless = require("serverless-http");

const app = express();

const USERS_TABLE = process.env.USERS_TABLE;
const dynamoDbClient = new AWS.DynamoDB.DocumentClient();

app.use(express.json());

app.get("/users/:userId", async function (req, res) {
  const params = {
    TableName: USERS_TABLE,
    Key: {
      userId: req.params.userId,
    },
  };

  try {
    const { Item } = await dynamoDbClient.get(params).promise();
    if (Item) {
      const { userId, name } = Item;
      res.json({ userId, name });
    } else {
      res
        .status(404)
        .json({ error: 'Could not find user with provided "userId"' });
    }
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Could not retreive user" });
  }
});

app.post("/users", async function (req, res) {
  const { userId, name, email, password } = req.body;
  if (typeof userId !== "string") {
    res.status(400).json({ error: '"userId" must be a string' });
  } else if (typeof name !== "string") {
    res.status(400).json({ error: '"name" must be a string' });
  }

  const params = {
    TableName: USERS_TABLE,
    Item: {
      userId: userId,
      name: name,
      email: email,
      password: password,
      date: Date()
    },
  };

  try {
    await dynamoDbClient.put(params).promise();
    res.json({ userId, name });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Could not create user" });
  }
});

app.put("/users/:userId", async function (req, res) {
  const { userId, name, email } = req.body;
  let updateExp = 'set';
  let expressionAttributeNames = {}
  let expressionAttributeValues = {}
  for (let [key, value] of Object.entries(req.body)) {
    updateExp += ` #${key} = :${key},`
    expressionAttributeNames[`#${key}`] = key;
    expressionAttributeValues[`:${key}`] = value
  }
  console.log(updateExp, expressionAttributeNames, expressionAttributeValues)
  const params = {
    TableName: USERS_TABLE,
    Key: {userId: req.params.userId},
    UpdateExpression: updateExp,
    ExpressionAttributeNames: expressionAttributeNames,
    ExpressionAttributeValues: expressionAttributeValues
  };

  try {
    await dynamoDbClient.update(params).promise();
    res.json({userId, name});
  } catch (error) {
    console.log(error);
    res.status(500).send({error: "Failed update"})
  }
})

app.get("/users", async function (req, res) {
  const params = {
    TableName: USERS_TABLE,
  };

  try {
    const users = await dynamoDbClient.scan(params).promise();
    console.log(users, 'users');
    res.json(users);
  } catch (error) {
    console.log(error);
    res.status(500).send({error: "Failed to get users!"})
  }
})

app.use((req, res, next) => {
  return res.status(404).json({
    error: "Not Found",
  });
});


module.exports.handler = serverless(app);
