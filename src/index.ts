import "dotenv/config";
import { supabase } from "#database/supabase.js";
import authRouter from "#routes/auth.js";
import listingsRouter from "#routes/listings.js";
import messagesRouter from "#routes/messages.js";
import notificationsRouter from "#routes/notifications.js";
import paymentsRouter from "#routes/payments.js";
import reservationsRouter from "#routes/reservations.js";
import reviewsRouter from "#routes/reviews.js";
import vehiclesRouter from "#routes/vehicles.js";
import { registerClient, removeClient } from "#websocket/wsManager.js";
import cors from "cors";
import express from "express";
import { createServer } from "http";
import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";
import { URL } from "url";
import { WebSocketServer } from "ws";

const app = express();
const port = process.env.PORT ?? "9001";

app.use(cors({ origin: process.env.CORS_ORIGIN ?? "*" }));
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));
app.use("/auth", authRouter);
app.use("/listings", listingsRouter);
app.use("/notifications", notificationsRouter);
app.use("/payments", paymentsRouter);
app.use("/conversations", messagesRouter);
app.use("/reservations", reservationsRouter);
app.use("/reviews", reviewsRouter);
app.use("/vehicles", vehiclesRouter);

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

// Wrap Express with an HTTP server so WebSocket can share the same port
const server = createServer(app);
const wss = new WebSocketServer({ server });

wss.on("connection", (ws, req) => {
  void (async () => {
    const reqUrl = new URL(req.url ?? "", `http://localhost:${port}`);
    const token = reqUrl.searchParams.get("token");

    if (!token) {
      ws.close(4001, "Missing token");
      return;
    }

    const { data, error } = await supabase.auth.getUser(token);
    if (error) {
      ws.close(4001, "Unauthorized");
      return;
    }

    const userId = data.user.id;
    registerClient(userId, ws);

    ws.on("close", () => {
      removeClient(userId, ws);
    });
  })();
});

server.listen(port, () => {
  console.log(`Listening on port ${port}`);
});
