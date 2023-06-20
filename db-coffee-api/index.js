const express = require("express");
const mongoose = require("mongoose");
const app = express();

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
