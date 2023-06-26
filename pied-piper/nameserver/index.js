const express = require("express");
const bodyParser = require("body-parser");
const zlib = require("zlib");
const crypto = require("crypto");
const mongoose = require("mongoose");

const CHUNK_SIZE = 1024; // 1kb

const app = express();

// Middlewares
app.use(bodyParser.json());

// MongoDB connection
mongoose.connect(
  "mongodb://admin:secret@db:27017/coffeeDB?authSource=admin&authMechanism=SCRAM-SHA-1",
  {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  }
);

const db = mongoose.connection;
db.on("error", console.error.bind(console, "connection error:"));
db.once("open", async function () {
  console.log("We're connected to MongoDB!");

  //   Delete all documents in collections
  //   await Promise.all([
  //     FileMetaModel.deleteMany({}),
  //     ChunkModel.deleteMany({}),
  //     StorageServerModel.deleteMany({}),
  //   ]);

  console.log("All collections have been cleared.");
});

// Define a schema
const Schema = mongoose.Schema;

const FileMetaSchema = new Schema({
  filename: String,
  chunks: [String],
  storedSize: Number,
  realSize: Number,
  _id: String,
});

// Compile model from schema
const FileMetaModel = mongoose.model("FileMeta", FileMetaSchema);

const ChunkSchema = new Schema({
  _id: String, // Chunk Hash
  refFiles: [String], // Array of file IDs
  storageServer: String, // ID of the storage server
  size: Number, // Size of the chunk
});

const ChunkModel = mongoose.model("Chunk", ChunkSchema);

const StorageServerSchema = new Schema({
  _id: String, // Storage server ID
  host: String, // Host of the storage server
  usedStorage: Number, // Amount of storage used by the server
});

const StorageServerModel = mongoose.model("StorageServer", StorageServerSchema);

app.post("/register", async (req, res) => {
  const { id, host } = req.body;

  // Check if the server already exists in the database
  const existingServer = await StorageServerModel.findById(id);

  if (existingServer) {
    return res.json({ status: "ok" });
  }

  const server = new StorageServerModel({
    _id: id,
    host,
    usedStorage: 0,
  });

  await server.save();
  console.log(`Registered storage server ${id} at ${host}`);
  res.json({ status: "ok" });
});

app.post("/store", async (req, res) => {
  const { filename, text } = req.body;
  const realSize = Buffer.byteLength(text, "utf-8");
  const buffer = Buffer.from(text, "utf-8");
  const compressed = zlib.brotliCompressSync(buffer);
  const fileSize = compressed.byteLength;
  const chunkCount = Math.ceil(fileSize / CHUNK_SIZE);

  const fileHash = crypto
    .createHash("sha256")
    .update(filename + compressed.toString())
    .digest("hex");

  let chunks = [];

  for (let i = 0; i < chunkCount; i++) {
    const chunk = compressed.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
    const chunkHash = crypto.createHash("sha256").update(chunk).digest("hex");
    chunks.push(chunkHash);

    const chunkModel = await ChunkModel.findById(chunkHash);

    if (chunkModel) {
      // If the chunk already exists, update the refFiles and continue to the next iteration
      if (!chunkModel.refFiles.includes(fileHash)) {
        chunkModel.refFiles.push(fileHash);
        await chunkModel.save();
      }
      continue;
    }

    const servers = await StorageServerModel.find().sort({ usedStorage: 1 });
    const selectedServer = servers[0];
    console.log(`Storing chunk on ${selectedServer._id}`);

    const response = await fetch(`${selectedServer.host}/store`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chunkId: chunkHash,
        data: chunk,
      }),
    });

    if (response.ok) {
      selectedServer.usedStorage += chunk.byteLength;
      await selectedServer.save();

      const newChunk = new ChunkModel({
        _id: chunkHash,
        refFiles: [fileHash],
        storageServer: selectedServer._id,
        size: chunk.byteLength, // Store the actual size of the chunk
      });
      await newChunk.save();
    }
  }

  const fileMetaInstance = new FileMetaModel({
    _id: fileHash,
    filename: filename,
    chunks: chunks,
    storedSize: fileSize,
    realSize: realSize,
  });

  const existingFile = await FileMetaModel.findById(fileHash);

  if (existingFile) {
    res.json({ id: fileHash });
    return;
  }

  await fileMetaInstance.save();

  res.json({ id: fileHash });
});
app.get("/read/:id", async (req, res) => {
  const { id } = req.params;
  const fileMetaInstance = await FileMetaModel.findById(id);
  if (!fileMetaInstance) {
    return res.status(404).json({ message: "File not found" });
  }

  const { chunks } = fileMetaInstance;

  let chunkData = Buffer.from([]);

  for (const chunkHash of chunks) {
    const chunk = await ChunkModel.findById(chunkHash);
    const server = await StorageServerModel.findById(chunk.storageServer);
    const response = await fetch(`${server.host}/read/${chunkHash}`);
    const data = JSON.parse(await response.json());
    const buffer = Buffer.from(data.data.data);
    chunkData = Buffer.concat([chunkData, buffer]);
  }
  res.set("Content-Encoding", "br");
  res.send(chunkData);
});

app.get("/delete/:id", async (req, res) => {
  const { id } = req.params;

  try {
    // Find the document by id
    const fileMetaInstance = await FileMetaModel.findById(id);

    if (!fileMetaInstance) {
      return res.status(404).json({ message: "File not found" });
    }

    // Delete each chunk of the file

    for (const chunkHash of fileMetaInstance.chunks) {
      const chunkModel = await ChunkModel.findById(chunkHash);
      if (chunkModel) {
        chunkModel.refFiles = chunkModel.refFiles.filter(
          (id) => id !== fileMetaInstance.id
        );

        if (chunkModel.refFiles.length === 0) {
          const server = await StorageServerModel.findById(
            chunkModel.storageServer
          );
          const response = await fetch(
            `${server.host}/delete/${chunkModel.id}`
          );
          if (response.ok) {
            server.usedStorage -= chunkModel.size; // Decrease by the actual size of the chunk
            await server.save();
            await ChunkModel.findByIdAndRemove(chunkHash);
          }
        } else {
          await chunkModel.save();
        }
      }
    }

    // Remove the document
    await FileMetaModel.findByIdAndRemove(id);

    res.json({ message: "File deleted" });
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ error: "An error occurred while deleting the file." });
  }
});

app.get("/size/:id", async (req, res) => {
  const { id } = req.params;
  const fileMetaInstance = await FileMetaModel.findById(id);
  if (!fileMetaInstance) {
    return res.status(404).json({ message: "File not found" });
  }

  res.json({
    realSize: fileMetaInstance.realSize,
    storedSize: fileMetaInstance.storedSize,
  });
});

const PORT = 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
