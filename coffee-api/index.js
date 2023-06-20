const express = require("express");
const app = express();
app.use(express.json());

// Coffee counts (hardcoded for simplicity)
let coffeeCounts = {
  latte: 0,
  cappuccino: 2,
  espresso: 1,
};

// Hardcoded authorization header
const authHeader = "mega_password";

// Middleware for checking authorization
function authenticate(req, res, next) {
  if (req.headers.authorization !== authHeader) {
    return res.status(401).send("Unauthorized");
  }
  next();
}

// Endpoint for getting favourite coffee
app.get("/v1/coffee/favourite", authenticate, (req, res) => {
  const favouriteCoffee = Object.keys(coffeeCounts).reduce((a, b) =>
    coffeeCounts[a] > coffeeCounts[b] ? a : b
  );
  res.json({ data: { favouriteCoffee } });
});

// Endpoint for getting top 3 favourite coffees
app.get("/v1/admin/coffee/favourite/leadeboard", authenticate, (req, res) => {
  const top3 = Object.entries(coffeeCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([coffee]) => coffee);
  res.json({ data: { top3 } });
});

//endpoint for health check
app.get("/health", (req, res) => {
  res.json({ data: { status: "OK from 3" } });
});

// Endpoint for setting favourite coffee
app.post("/v1/coffee/favourite", authenticate, (req, res) => {
  //get form data
  const favouriteCoffee = req.body.favouriteCoffee;
  if (
    favouriteCoffee === undefined ||
    favouriteCoffee === null ||
    favouriteCoffee === ""
  ) {
    return res.status(400).send("Bad Request");
  }
  coffeeCounts[favouriteCoffee] = (coffeeCounts[favouriteCoffee] || 0) + 1;
  const top3 = Object.entries(coffeeCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([coffee]) => coffee);
  res.json({ data: { top3 } });
});

const port = 3000;
app.listen(port, () => console.log(`Server is running on port ${port}`));
