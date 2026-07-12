const express = require("express");

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Promise Rejection (server stayed up):", reason);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception (server stayed up):", err);
});

const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
require("dotenv").config();
const User = require("./models/User");

const app = express();
app.set("trust proxy", 1);

const compression = require("compression");
app.use(compression());

// 1. Security Headers
app.use(helmet());

// 2. CORS Configuration
const allowedOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://aster-medcare.vercel.app",
  process.env.CLIENT_URL
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, or postman)
      if (!origin || allowedOrigins.includes(origin) || origin.includes("aster-medcare")) {
        callback(null, true);
      } else {
        callback(new Error(`Origin ${origin} not allowed by CORS`));
      }
    },
    credentials: true,
    optionsSuccessStatus: 200
  })
);

// 3. Rate Limiting deactivated

// 4. JSON Body Parser (10mb limit for file upload payloads/form inputs)
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));

// 5. Health Check Route
app.get("/health", async (req, res) => {
  try {
    const dbName = mongoose.connection.db ? mongoose.connection.db.databaseName : "Not Connected";
    const userCount = await User.countDocuments();
    res.status(200).json({ 
      status: "UP", 
      dbName,
      userCount,
      timestamp: new Date() 
    });
  } catch (err) {
    res.status(500).json({ status: "DOWN", error: err.message });
  }
});

// 6. Mount API Routes
const authRoutes = require("./routes/auth");
const patientRoutes = require("./routes/patients");
const formRoutes = require("./routes/forms");
const fileRoutes = require("./routes/files");
const userRoutes = require("./routes/users");
const analyticsRoutes = require("./routes/analytics");
const pdfRoutes = require("./routes/pdf");
const settingRoutes = require("./routes/settings");

app.use("/api/auth", authRoutes);
app.use("/api/patients", patientRoutes);
app.use("/api/patients", formRoutes);
app.use("/api/patients", fileRoutes);
app.use("/api/users", userRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/forms", pdfRoutes);
app.use("/api/settings", settingRoutes);

// 7. 404 Route Handler
app.use((req, res, next) => {
  res.status(404).json({ message: `Route ${req.originalUrl} not found.` });
});

// 8. Global Error Handler
app.use((err, req, res, next) => {
  console.error("Unhandled Exception:", err);

  // If the client already disconnected (e.g. aborted upload), there's no one to
  // respond to — trying to write a response here would throw a second error.
  if (err.type === "request.aborted" || err.code === "ECONNABORTED" || res.headersSent) {
    return; // just log it above, nothing more to do
  }

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

const ALL_FORMS = [
  "preMedical", "postMedical", "eyeExam", "form33", "healthRegister", "xrayReport",
  "4-form-airport-bohw", "5-form-height-pass", "10-form-ophthal-form-6",
  "form9", "form10",
  "11-form-audiometry-front", "12-form-audiometry-back", "13-form-pft-front", "14-form-pft-back", "15-form-vaccination-front",
  "16-form-vaccination-back", "17-form-food-handler-certificate", "18-form-vaccine-ircs-forms-2", "19-form-ecg", "25-form-for-medical-fitness-certificate-format", "26-form-death-certificate",
  "35-form-airport-bohw-ht-front", "36-form-airport-bohw-ht-back", "form23"
];

async function autoSeed() {
  try {
    const userCount = await User.countDocuments();
    if (userCount === 0) {
      console.log("No users found in database. Auto-seeding default users...");
      const usersToSeed = [
        {
          name: "System Admin",
          email: "admin@astermedcare.com",
          password: "Admin@123456",
          role: "admin",
          formAccess: ALL_FORMS,
          isActive: true
        },
        {
          name: "Doctor Patel",
          email: "doctor@astermedcare.com",
          password: "Doctor@12345",
          role: "doctor",
          formAccess: ALL_FORMS,
          isActive: true
        },
        {
          name: "Staff Member One",
          email: "staff1@astermedcare.com",
          password: "Staff1@12345",
          role: "employee",
          formAccess: ["eyeExam", "postMedical"],
          isActive: true
        },
        {
          name: "Staff Member Two",
          email: "staff2@astermedcare.com",
          password: "Staff2@12345",
          role: "employee",
          formAccess: [],
          isActive: true
        }
      ];
      for (const u of usersToSeed) {
        const newUser = new User(u);
        await newUser.save();
      }
      console.log("Auto-seeding default users completed successfully.");
    }
  } catch (err) {
    console.error("Auto-seeding default users failed:", err);
  }
}

// 10. Start Server
const PORT = process.env.PORT || 5000;
let server;

connectDB().then(async () => {
  await autoSeed();
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
