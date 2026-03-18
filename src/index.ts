import "dotenv/config";
import authRouter from "#routes/auth.js";
import listingsRouter from "#routes/listings.js";
import reservationsRouter from "#routes/reservations.js";
import cors from "cors";
import express from "express";
import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";

const app = express();
const port = process.env.PORT ?? "9001";

app.use(cors({ origin: process.env.CORS_ORIGIN ?? "*" }));
app.use(express.json());
app.use("/auth", authRouter);
app.use("/listings", listingsRouter);
app.use("/reservations", reservationsRouter);

app.get("/", (req, res) => {
  res.send("Hello World!");
  console.log("Response sent");
});

const isProd = process.env.NODE_ENV === "production";
const swaggerOptions = {
  apis: [isProd ? "./dist/src/routes/*.js" : "./src/routes/*.ts"],
  swaggerDefinition: {
    info: {
      description: "Control Park Swagger API Docs",
      title: "Control Park",
      version: "1.0.0",
    },
    openapi: "3.0.0",
  },
};

const swaggerDocs = swaggerJsdoc(swaggerOptions);
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocs));

app.listen(port, () => {
  console.log(`Test listening on port ${port}`);
});
