const express = require("express");
const path = require("path");
const cors = require("cors");
const dotenv = require("dotenv");
const http = require("http");

dotenv.config();

const db = require("./database/db");
const getIPAddress = require("./utils/ipAddress");
const errorHandler = require("./middleware/errorHandler");
const { performanceLogger } = require("./middleware/performanceLogger");
const { initializeSocket } = require("./utils/socket");

const app = express();
const server = http.createServer(app); // Create an HTTP server

initializeSocket(server); // Initialize Socket.io

// Middleware
app.use(performanceLogger);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  cors({
    origin: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

// Handle preflight requests (OPTIONS method)
app.options("*", cors());

// Static middleware to serve images from public/images
app.use("/public", express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.send("Welcome to Hubcare");
});

// Routes
app.use("/api", require("./routes/auth.route"));

// DEEPAK ----
//** ADMIN */
app.use("/api/admin/", require("./routes/admin.routes"));

// ** Services
app.use("/api/category/",require("./routes/category.routes"))
app.use("/api/sub_category/",require("./routes/sub_category.routes"))
app.use("/api/subCategory_service/",require("./routes/subCategory_service.routes"))

// ** Review & Rating
app.use("/api/review/",require("./routes/reviewRating.routes"))

// ** Booking Service
app.use("/api/booking_service/",require("./routes/booking_service.routes"))

// ** User Location 
app.use("/api/user_location/",require("./routes/user_locations.routes"))

// ** Promo Offer
app.use("/api/promo-offer/",require("./routes/promo_offer.routes"))

//** Slider */
app.use("/api/slider/",require("./routes/slider.routes")) // Skip This Logic Used Banner Routes---
app.use("/api/banner/",require("./routes/banner.routes"))

//** Worker */
app.use("/api/worker/",require("./routes/worker.routes"))

//** Notification */
app.use("/api/notification/",require("./routes/user_notifications.routes"))

//** Help Support */
app.use("/api/help_support/",require("./routes/help_support.routes"))

//** Privacy Policy */
app.use("/api/privacy_policy/",require("./routes/privacy_policy.routes"))

//** Wallet */
app.use("/api/wallet/",require("./routes/wallet.routes"))

//** Chat */
app.use("/api", require("./routes/chat/chat.route"));

app.use("*", (req, res) => {
  res.status(404).json({
    status: false,
    message: "API endpoint not found",
  });
});

app.use(errorHandler);

const IpAddress = getIPAddress();

// Start the server with Socket.io
server.listen(process.env.PORT, () => {
  console.log(
    `Server is listening on http://${IpAddress ? IpAddress : "localhost"}:${
      process.env.PORT
    }/`
  );
});
