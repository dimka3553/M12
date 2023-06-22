const express = require("express");
const mongoose = require("mongoose");
const app = express();
const AWS = require("aws-sdk");

AWS.config.update({
  accessKeyId: "", // insert your access key id
  secretAccessKey: "", // insert your secret access key
  region: "eu-central-1",
});

const queueURL = ""; // insert your queue url

var sqs = new AWS.SQS({ apiVersion: "2012-11-05" });
mongoose
  .connect(
    "mongodb://admin:secret@db:27017/coffeeDB?authSource=admin&authMechanism=SCRAM-SHA-1",
    {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    }
  )
  .then(() => console.log("Connected to MongoDB..."))
  .catch((error) => {
    console.error("Could not connect to MongoDB...", error);
    process.exit(1);
  });

const coffeeCountSchema = new mongoose.Schema({
  type: String,
  count: Number,
});

const CoffeeCount = mongoose.model("CoffeeCount", coffeeCountSchema);

app.use(express.json());

const authHeader = "mega_password";

function authenticate(req, res, next) {
  if (req.headers.authorization !== authHeader) {
    return res.status(401).send("Unauthorized");
  }
  next();
}

const userSchema = new mongoose.Schema({
  name: String,
  favouriteCoffee: String,
});

const User = mongoose.model("User", userSchema);

app.post("/v1/user/create", authenticate, async (req, res) => {
  try {
    const { name, favouriteCoffee } = req.body;
    if (
      name === undefined ||
      name === null ||
      name === "" ||
      favouriteCoffee === undefined ||
      favouriteCoffee === null ||
      favouriteCoffee === ""
    ) {
      return res.status(400).send("Bad Request");
    }

    const newUser = new User({ name, favouriteCoffee });
    await newUser.save();

    // Message to be sent to the SQS queue
    var message = {
      MessageAttributes: {
        Name: {
          DataType: "String",
          StringValue: newUser.name,
        },
        Id: {
          DataType: "String",
          StringValue: newUser._id.toString(),
        },
        FavouriteCoffee: {
          DataType: "String",
          StringValue: newUser.favouriteCoffee,
        },
      },
      MessageBody: "User created",
      QueueUrl: queueURL,
    };

    sqs.sendMessage(message, function (err, data) {
      if (err) {
        console.log("Error", err);
      } else {
        console.log("Success", data.MessageId);
      }
    });

    res.json({ data: { user: newUser } });
  } catch (error) {
    res.status(500).send("Internal server error");
    console.error(error);
  }
});

app.get("/v1/coffee/favourite", authenticate, async (req, res) => {
  try {
    const coffeeData = await CoffeeCount.find({});
    const favouriteCoffee = coffeeData.sort((a, b) => b.count - a.count)[0];
    res.json({ data: { favouriteCoffee: favouriteCoffee.type } });
  } catch (error) {
    res.status(500).send("Internal server error");
    console.error(error);
  }
});

app.get(
  "/v1/admin/coffee/favourite/leadeboard",
  authenticate,
  async (req, res) => {
    try {
      const coffeeData = await CoffeeCount.find({});
      const top3 = coffeeData
        .sort((a, b) => b.count - a.count)
        .slice(0, 3)
        .map((coffee) => coffee.type);
      res.json({ data: { top3 } });
    } catch (error) {
      res.status(500).send("Internal server error");
      console.error(error);
    }
  }
);

app.get("/health", (req, res) => {
  res.json({ data: { status: "OK", id: process.env.ID } });
});

app.post("/v1/coffee/favourite", authenticate, async (req, res) => {
  try {
    const favouriteCoffee = req.body.favouriteCoffee;
    if (
      favouriteCoffee === undefined ||
      favouriteCoffee === null ||
      favouriteCoffee === ""
    ) {
      return res.status(400).send("Bad Request");
    }

    let coffee = await CoffeeCount.findOne({ type: favouriteCoffee });
    if (coffee) {
      coffee.count++;
      await coffee.save();
    } else {
      coffee = await CoffeeCount.create({ type: favouriteCoffee, count: 1 });
    }

    const coffeeData = await CoffeeCount.find({});
    const top3 = coffeeData
      .sort((a, b) => b.count - a.count)
      .slice(0, 3)
      .map((coffee) => coffee.type);
    res.json({ data: { top3 } });
  } catch (error) {
    res.status(500).send("Internal server error");
    console.error(error);
  }
});

const port = 3000;
app.listen(port, () => console.log(`Server is running on port ${port}`));

// Add a consumer that periodically checks for new messages

setInterval(function () {
  var params = {
    AttributeNames: ["All"],
    MaxNumberOfMessages: 10,
    MessageAttributeNames: ["All"],
    QueueUrl: queueURL,
    WaitTimeSeconds: 0,
  };

  sqs.receiveMessage(params, function (err, data) {
    if (err) {
      console.log("Receive Error", err);
    } else if (data.Messages) {
      for (let message of data.Messages) {
        let name = message.MessageAttributes.Name.StringValue;
        let favouriteCoffee =
          message.MessageAttributes.FavouriteCoffee.StringValue;
        console.log(
          `Message processed: favourite coffee ${favouriteCoffee} served to ${name}`
        );

        var deleteParams = {
          QueueUrl: queueURL,
          ReceiptHandle: message.ReceiptHandle,
        };

        sqs.deleteMessage(deleteParams, function (err, data) {
          if (err) {
            console.log("Delete Error", err);
          } else {
            console.log("Message Deleted", data);
          }
        });
      }
    }
  });
}, 5000);
