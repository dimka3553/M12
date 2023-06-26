const express = require("express");
const fs = require("fs");
const path = require("path");
const bodyParser = require("body-parser");
const dotenv = require("dotenv");
dotenv.config();
const app = express();

// Parse JSON bodies (as sent by API clients)
app.use(bodyParser.json());

const CHUNKS_DIR = process.env.CHUNKS_DIR || "/chunks";

if (!fs.existsSync(CHUNKS_DIR)) {
  fs.mkdirSync(CHUNKS_DIR);
}

app.post("/store", (req, res) => {
  const { chunkId, data } = req.body;
  const chunkFilePath = path.join(CHUNKS_DIR, chunkId);

  fs.writeFileSync(chunkFilePath, Buffer.from(data.data));

  res.json({ status: "ok" });
});

app.get("/read/:chunkId", (req, res) => {
  const { chunkId } = req.params;
  const chunkFilePath = path.join(CHUNKS_DIR, chunkId);
  let chunk = null;

  try {
    chunk = fs.readFileSync(chunkFilePath);
  } catch (err) {
    res.status(404).json({ message: "Chunk not found" });
    return;
  }
  if (chunk) {
    res.json(JSON.stringify({ data: chunk }));
  } else {
    res.status(404).json({ message: "Chunk not found" });
  }
});

app.get("/delete/:chunkId", (req, res) => {
  const { chunkId } = req.params;
  const chunkFilePath = path.join(CHUNKS_DIR, chunkId);

  if (fs.existsSync(chunkFilePath)) {
    fs.unlinkSync(chunkFilePath);
  } else {
    res.status(404).json({ message: "Chunk not found" });
    return;
  }
  res.json({ status: "ok" });
});

const PORT = 4000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

async function register() {
  // Using setInterval to poll every 10 seconds
  setInterval(async () => {
    try {
      await fetch("http://nameserver:3000/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: process.env.ID,
          host: process.env.HOST,
        }),
      });
    } catch (error) {
      // Logging the error in case of failure
      console.error("Failed to register:", error);
    }
  }, 10000); // 10000 milliseconds = 10 seconds
}

register();
