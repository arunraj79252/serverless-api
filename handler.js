const AWS = require("aws-sdk");
const express = require("express");
const { param } = require("express/lib/request");
const res = require("express/lib/response");
const serverless = require("serverless-http");

const app = express();

const USERS_TABLE = process.env.USERS_TABLE;
const DEMO_TABLE = process.env.DEMO_TABLE
const CLIENT_ID = process.env.CLIENT_ID;
const USER_POOL_ID = process.env.USER_POOL_ID;
const dynamoDbClient = new AWS.DynamoDB.DocumentClient();
const cognito = new AWS.CognitoIdentityServiceProvider();

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
  const { userId, name, email, password, jobs: { jobId, jobName } } = req.body;
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
      date: Date(),
      jobs: {
        jobId: jobId,
        jobName: jobName
      }
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
  const params = {
    TableName: USERS_TABLE,
    Key: { userId: req.params.userId },
    UpdateExpression: updateExp.substring(0, updateExp.lastIndexOf(',')),
    ExpressionAttributeNames: expressionAttributeNames,
    ExpressionAttributeValues: expressionAttributeValues
  };

  try {
    await dynamoDbClient.update(params).promise();
    res.json({ userId, name });
  } catch (error) {
    console.log(error);
    res.status(500).send({ error: "Failed update" })
  }
});

app.get("/users", async function (req, res) {
  console.log(req.query.name);
  const params = {
    TableName: USERS_TABLE,
    FilterExpression: '#name = :name',
    ExpressionAttributeNames: { '#name': 'name' },
    ExpressionAttributeValues: { ':name': req.query.name ? req.query.name : '' }
  };

  try {
    const users = await dynamoDbClient.scan(params).promise();
    console.log(users, 'users');
    res.json(users);
  } catch (error) {
    console.log(error);
    res.status(500).send({ error: "Failed to get users!" })
  }
});

app.delete("/users/:userId", async function (req, res) {
  const params = {
    TableName: USERS_TABLE,
    Key: {
      userId: req.params.userId
    }
  }
  try {
    dynamoDbClient.delete(params).promise();
    res.status(200);
  } catch (error) {
    console.log(error);
    res.status(500).send({
      message: "Failed to delete user!"
    })
  }
});

app.post("/users/cognito-register", async function (req, res) {
  const { username, email, phone_number, password } = req.body;
  const params = {
    ClientId: CLIENT_ID,
    Username: username,
    Password: password,
    UserAttributes: [
      {
        Name: 'email',
        Value: email
      }
    ]
  }
  try {
    cognito.signUp(params, function (err, data) {
      if (err) {
        console.log(err);
        res.status(err.statusCode).send({
          error: err
        })
      } else {
        res.json(data);
      }
    });
  } catch (error) {
    console.log(error);
    res.status(500).send({
      message: error
    })
  }
});

app.post("/users/cognito-confirm-register", async function (req, res) {
  const { username, confirmationCode } = req.body;
  const params = {
    ClientId: CLIENT_ID,
    ConfirmationCode: confirmationCode,
    Username: username,
  }
  try {
    cognito.confirmSignUp(params, function (err, data) {
      if (err) {
        console.log(err);
        res.status(err.statusCode).send({
          message: err
        })
      } else {
        res.json(data);
      }
    })
  } catch (error) {
    console.error(error);
    res.status(500).send('Verification failed');
  }
});

app.post("/users/cognito-auth", async function (req, res) {
  const { username, password } = req.body;
  const params = {
    ClientId: CLIENT_ID,
    UserPoolId: USER_POOL_ID,
    AuthFlow: 'ADMIN_USER_PASSWORD_AUTH',
    AuthParameters: {
      USERNAME: username,
      PASSWORD: password
    }
  }
  try {
    cognito.adminInitiateAuth(params, function (err, data) {
      if (err) {
        console.log(err);
        res.status(err.statusCode).send({
          error: err
        })
      } else {
        res.json(data);
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).send({
      message: `Failed to authenticate ${username}`
    })
  }
});

app.post("/users/cognito-auth-refresh", async function (req, res) {
  const { refreshToken } = req.body;
  const params = {
    ClientId: CLIENT_ID,
    UserPoolId: USER_POOL_ID,
    AuthFlow: 'REFRESH_TOKEN',
    AuthParameters: {
      REFRESH_TOKEN: refreshToken
    }
  }
  try {
    cognito.adminInitiateAuth(params, function (err, data) {
      if (err) {
        console.log(err);
        res.status(err.statusCode).send({
          error: err
        })
      } else {
        res.json(data);
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).send({
      message: `Failed to refresh token`
    })
  }
})

app.post("/users/cognito-forgotpassword", async function (req, res) {
  const { username } = req.body;
  const params = {
    ClientId: CLIENT_ID,
    Username: username,
  }
  try {
    cognito.forgotPassword(params, function (err, data) {
      if (err) {
        console.log(err);
        res.status(err.statusCode).send({
          message: err
        })
      } else {
        res.json(data);
      }
    })
  } catch (error) {
    console.error(error);
    res.status(500).send('reset pasword failed');
  }
});


app.post("/users/cognito-confirm-forgotpassword", async function (req, res) {
  const { username, confirmationcode, password } = req.body;
  const params = {
    ClientId: CLIENT_ID,
    ConfirmationCode: confirmationcode,
    Password: password,
    Username: username

  }
  try {
    cognito.confirmForgotPassword(params, function (err, data) {
      if (err) {
        console.log(err);
        res.status(err.statusCode).send({
          message: err
        })
      } else {
        res.json(data);
      }
    })
  } catch (error) {
    console.error(error);
    res.status(500).send('Password updation failed');
  }
});

app.post("/test/add", async function (req, res) {
  const { id,name,clustermembers:[{email,role}]} = req.body;
  if (typeof demoId !== "string") {
    res.status(400).json({ error: '"userId" must be a string' });
  } else if (typeof name !== "string") {
    res.status(400).json({ error: '"name" must be a string' });
  }

  const params = {
    TableName: DEMO_TABLE,
    Item: {

      demoId: id,
      name: name,
      clustermembers: [
        {
          email: email,
          role: role,
          demoId: id
        }
      ]
    }
  };

  try {
    await dynamoDbClient.put(params).promise();
    res.json({ demoId, name });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Could not create user" });
  }
});


app.use((req, res, next) => {
  return res.status(404).json({
    error: "Not Found",
  });
});

module.exports.handler = serverless(app);

