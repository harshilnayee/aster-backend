const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
require("dotenv").config();

const app = express();

// 1. Security Headers
app.use(helmet());

// 2. CORS Configuration
const allowedOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  process.env.CLIENT_URL
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, or postman)
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`Origin ${origin} not allowed by CORS`));
      }
    },
    credentials: true,
    optionsSuccessStatus: 200
  })
);

// 3. Rate Limiting (100 requests per 15 minutes per IP in production, 10000 in dev)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === "development" ? 10000 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests from this IP, please try again after 15 minutes." }
});
app.use("/api", limiter);

// 4. JSON Body Parser (10mb limit for file upload payloads/form inputs)
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));

// 5. Health Check Route
app.get("/health", (req, res) => {
  res.status(200).json({ status: "UP", timestamp: new Date() });
});

// 6. Mount API Routes
const authRoutes = require("./routes/auth");
const patientRoutes = require("./routes/patients");
const formRoutes = require("./routes/forms");
const fileRoutes = require("./routes/files");
const userRoutes = require("./routes/users");
const analyticsRoutes = require("./routes/analytics");

app.use("/api/auth", authRoutes);
app.use("/api/patients", patientRoutes);
app.use("/api/patients", formRoutes);
app.use("/api/patients", fileRoutes);
app.use("/api/users", userRoutes);
app.use("/api/analytics", analyticsRoutes);

// 7. 404 Route Handler
app.use((req, res, next) => {
  res.status(404).json({ message: `Route ${req.originalUrl} not found.` });
});

// 8. Global Error Handler
app.use((err, req, res, next) => {
  console.error("Unhandled Exception:", err);
  
  const statusCode = err.statusCode || 500;
  const message = err.message || "Internal Server Error";
  
  res.status(statusCode).json({
    status: "error",
    statusCode,
    message,
    stack: process.env.NODE_ENV === "development" ? err.stack : undefined
  });
});

// 9. MongoDB connection with retry logic
const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error("Fatal Error: MONGO_URI environment variable is not defined.");
  process.exit(1);
}

const maxRetries = 5;
let retryCount = 0;

async function connectDB() {
  while (retryCount < maxRetries) {
    try {
      await mongoose.connect(MONGO_URI);
      console.log("Successfully connected to MongoDB.");
      return;
    } catch (error) {
      retryCount++;
      console.error(`Database connection failed (attempt ${retryCount}/${maxRetries}):`, error.message);
      if (retryCount >= maxRetries) {
        console.error("Exceeded max database connection retries. Exiting server...");
        process.exit(1);
      }
      // Wait 5 seconds before retrying
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}

// 10. Start Server
const PORT = process.env.PORT || 5000;
let server;

connectDB().then(() => {
  server = app.listen(PORT, () => {
    console.log(`Server running in ${process.env.NODE_ENV || "production"} mode on port ${PORT}`);
  });
});

// 11. Graceful Shutdown
function handleShutdown(signal) {
  console.log(`Received ${signal}. Starting graceful shutdown...`);
  if (server) {
    server.close(async () => {
      console.log("HTTP server closed.");
      try {
        await mongoose.connection.close();
        console.log("MongoDB connection closed safely.");
        process.exit(0);
      } catch (err) {
        console.error("Error closing MongoDB connection:", err.message);
        process.exit(1);
      }
    });
  } else {
    process.exit(0);
  }
}

process.on("SIGTERM", () => handleShutdown("SIGTERM"));
process.on("SIGINT", () => handleShutdown("SIGINT"));
