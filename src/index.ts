import express from "express";

const app = express();
const port = process.env.PORT ?? "9001";

app.get("/", (req, res) => {
  res.send("Hello World!");
  console.log("Response sent");
});

app.listen(port, () => {
  console.log(`Test listening on port ${port}`);
});
