// DEEPAK ----

const db = require("../database/db");
require("dotenv").config();
const moment = require("moment");
const {
  booking_service,
  subCategory_services,
  promo_offer,
  user_locations,
  wallet,
  wallet_transaction,
  user,
  worker,
  booking_workers,
  review_ratings,
  promo_redemption,
  user_notification,
} = db;
const { validationResult } = require("express-validator");
const { Op } = require("sequelize");
const { getConnectedUsers, getSocketInstance } = require("../utils/socket");
const sendNotificationToUsers  = require("../utils/sendNotificationToUsers");

// Payment Process
const processPayment = async (userId, amount, method, providerId, transaction) => {
  if (method !== "WALLET") return { success: false, message: "Invalid payment method" };

  const [userWallet, providerWallet] = await Promise.all([
    wallet.findOne({ where: { userId }, transaction }),
    wallet.findOne({ where: { userId: providerId }, transaction }),
  ]);

  if (!userWallet || parseFloat(userWallet.balance) < parseFloat(amount)) {
    return { success: false, message: "Insufficient wallet balance" };
  }

  // Deduct from user wallet
  userWallet.balance = parseFloat(userWallet.balance) - parseFloat(amount);
  await userWallet.save({ transaction });

  await wallet_transaction.create({
    userId,
    amount,
    type: "DEBIT",
    description: "Service booking payment via wallet",
  }, { transaction });

  if (providerWallet) {
    const commissionRate = parseFloat(process.env.PROVIDER_COMMSSION || "0.8");
    const providerShare = parseFloat((amount * commissionRate).toFixed(2));

    providerWallet.balance = parseFloat(providerWallet.balance) + providerShare;
    await providerWallet.save({ transaction });

    await wallet_transaction.create({
      userId: providerId,
      amount: providerShare,
      type: "CREDIT",
      description: "Service payment received",
    }, { transaction });
  }

  return { success: true };
};

//// **** User ----
// // Cash Payment update Status Skip Cash Step
const confirmCashPayment = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const providerId = req.user?.id;

    const booking = await booking_service.findOne({
      where: { id: bookingId, providerId },
    });

    if (!booking) {
      return res
        .status(404)
        .json({ message: "Booking not found or unauthorized" });
    }

    if (booking.paymentMethod !== "CASH") {
      return res.status(400).json({ message: "Payment method is not cash" });
    }

    if (booking.paymentStatus === "COMPLETED") {
      return res.status(400).json({ message: "Payment already completed" });
    }

    const providerWallet = await wallet.findOne({
      where: { userId: providerId },
    });
    const adminWallet = await wallet.findOne({ where: { role: "Admin" } });

    if (!providerWallet || !adminWallet) {
      return res.status(404).json({ message: "Wallet not found" });
    }

    const totalAmount = booking.totalAmount;
    const commission = totalAmount * process.env.ADMIN_COMMISSION;
    const netAmount = totalAmount - commission;

    //Add full amount to provider's wallet
    providerWallet.balance += totalAmount;
    await providerWallet.save();

    // 2. Record wallet transaction - provider credited
    await wallet_transaction.create({
      userId: providerId,
      amount: totalAmount,
      type: "CREDIT",
      description: `Cash payment received for booking ID ${booking.id}`,
    });

    // 3. Deduct 20% commission from provider
    providerWallet.balance -= commission;
    await providerWallet.save();

    await wallet_transaction.create({
      userId: providerId,
      amount: commission,
      type: "DEBIT",
      description: `20% commission deducted for booking ID ${booking.id}`,
    });

    // 4. Add commission to admin wallet
    adminWallet.balance += commission;
    await adminWallet.save();

    await wallet_transaction.create({
      userId: ADMIN_USER_ID,
      amount: commission,
      type: "CREDIT",
      description: `Commission received from provider ID ${providerId} for booking ID ${booking.id}`,
    });

    // 5. Mark payment as completed
    booking.paymentStatus = "COMPLETED";
    await booking.save();

    return res.status(200).json({
      message: "Cash payment processed, wallet updated, commission transferred",
      booking,
    });
  } catch (error) {
    console.error("Error confirming cash payment:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// Add Booking
const addBooking = async (req, res) => {
  const t = await db.sequelize.transaction(); // start transaction
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ status: false, message: "User is not authenticated." });

    const { serviceId } = req.params;
    const {
      serviceDate, numberOfWorker, startTime, workHours,
      locationId, offerId, paymentMethod, notificationId,
    } = req.body;

    if (!serviceId) return res.status(400).json({ message: "Service ID is required" });

    // Format and validate date and time
    const parsedDate = moment(serviceDate, ["M/D/YYYY", "YYYY-MM-DD"], true);
    const parsedTime = moment(startTime, ["hh:mm A", "HH:mm"], true);
    if (!parsedDate.isValid()) return res.status(400).json({ message: "Invalid service date format" });
    if (!parsedTime.isValid()) return res.status(400).json({ message: "Invalid start time format" });

    const formattedDate = parsedDate.format("YYYY-MM-DD");
    const formattedStartTime = parsedTime.format("HH:mm:ss");

    const [service, location] = await Promise.all([
      subCategory_services.findOne({ where: { id: serviceId } }),
      user_locations.findOne({ where: { id: locationId, userId } }),
    ]);

    if (!service) return res.status(404).json({ message: "Service not found" });
    if (!location) return res.status(404).json({ message: "Location not found" });

    const existingBooking = await booking_service.findOne({
      where: {
        userId,
        serviceId,
        serviceDate: formattedDate,
        bookingStatus: { [db.Sequelize.Op.notIn]: ["COMPLETED", "CANCELLED"] },
      },
    });

    if (existingBooking) {
      return res.status(400).json({ message: "You already have an active booking for this service." });
    }

    const baseAmount = service.servicePrice * numberOfWorker * workHours;
    let discountAmount = 0;

    if (offerId) {
      const [offer, alreadyRedeemed] = await Promise.all([
        promo_offer.findOne({ where: { id: offerId } }),
        promo_redemption.findOne({ where: { userId, promoOfferId: offerId } }),
      ]);

      if (alreadyRedeemed) return res.status(400).json({ message: "You have already used this promo code." });

      if (offer) {
        discountAmount = offer.discountType === "PERCENTAGE"
          ? baseAmount * (offer.discountValue / 100)
          : offer.discountValue;
      }
    }

    const amountAfterDiscount = baseAmount - discountAmount;
    const taxRate = parseFloat(process.env.BOOKING_TAXES || "0");
    const taxesAndFees = amountAfterDiscount * taxRate;
    const finalAmount = parseFloat((amountAfterDiscount + taxesAndFees).toFixed(2));

    let paymentStatus = "PENDING";

    if (paymentMethod !== "CASH") {
      const paymentResult = await processPayment(userId, finalAmount, paymentMethod, service.providerId, t);
      if (!paymentResult.success) {
        await t.rollback();
        return res.status(400).json({ message: paymentResult.message || "Payment failed" });
      }
      paymentStatus = "COMPLETED";
    }

    const booking = await booking_service.create({
      serviceId: service.id,
      userId,
      providerId: service.providerId,
      services: service.serviceName,
      locationId,
      serviceDate: formattedDate,
      numberOfWorker,
      amount: service.servicePrice,
      startTime: formattedStartTime,
      workHours,
      offerId: offerId || null,
      discountAmount,
      taxesAndFees,
      finalAmount,
      paymentMethod,
      paymentStatus,
    }, { transaction: t });

    if (offerId) {
      await promo_redemption.create({
        userId,
        promoOfferId: offerId,
        bookingId: booking.id,
        discountAmount,
      }, { transaction: t });
    }

    if (notificationId) {
      await user_notification.update(
        { converted: true },
        { where: { id: notificationId, userId }, transaction: t }
      );
    }

    await t.commit();

    const [currentUser, adminUser, providerUser] = await Promise.all([
      user.findOne({ where: { id: userId }, attributes: ["id", "name", "device_token"] }),
      user.findOne({ where: { role: "Admin" }, attributes: ["id", "name", "device_token"] }),
      user.findOne({ where: { id: service.providerId }, attributes: ["id", "name", "device_token"] }),
    ]);

    await sendNotificationToUsers([
      {
        user: currentUser,
        title: "Booking Created!",
        message: `Your Booking has been successfully created. Booking ID: ${booking.id}`,
        type: "BOOKING",
      },
      {
        user: adminUser,
        title: "New Booking Received!",
        message: `A new booking has been created by ${currentUser?.name || "a user"}.`,
        type: "BOOKING",
      },
      {
        user: providerUser,
        title: "New Booking Received!",
        message: `A new booking has been created by ${currentUser?.name || "a user"}.`,
        type: "BOOKING",
      },
    ]);

    return res.status(201).json({
      status: true,
      message: "Booking created successfully",
      data: booking,
    });
  } catch (error) {
    await t.rollback();
    console.error("Error creating booking:", error);
    return res.status(500).json({ status: false, message: "Internal server error", error: error.message });
  }
};

// Complete And Start Booking Service
const bookingAction = async (req, res) => {
  const { bookingId } = req.params;
  const { action } = req.body;

  // Helper to respond with error
  const sendError = (message, status = 400) =>
    res.status(status).json({ status: false, message });

  try {
    // Validate input
    if (!bookingId || !["START", "COMPLETE"].includes(action)) {
      return sendError("Invalid booking ID or action");
    }

    // Fetch booking
    const booking = await booking_service.findOne({ where: { id: bookingId } });
    if (!booking) return sendError("Booking not found", 404);

    // Block cancelled or already completed bookings
    if (["CANCELLED", "COMPLETED"].includes(booking.bookingStatus)) {
      return sendError(
        `Booking is ${booking.bookingStatus.toLowerCase()}. Action not allowed.`
      );
    }

    // START action checks
    if (action === "START") {
      if (booking.workingStatus !== "NOT_STARTED") {
        return sendError("Booking already started");
      }
      if (booking.workerAssignStatus !== "ASSIGNED") {
        return sendError("Worker not yet assigned");
      }
      if (booking.paymentStatus !== "COMPLETED") {
        return sendError("Payment not completed");
      }

      booking.workingStatus = "STARTED";
      booking.startTimestamp = new Date();
    }

    // COMPLETE action checks
    if (action === "COMPLETE") {
      if (booking.workingStatus !== "STARTED") {
        return sendError("Booking not started");
      }

      booking.workingStatus = "COMPLETED";
      booking.bookingStatus = "COMPLETED";
      booking.completedAt = new Date();
    }

    await booking.save();

    return res.status(200).json({
      status: true,
      message: `Booking ${
        action === "START" ? "started" : "completed"
      } successfully`,
      // data: booking,
    });
  } catch (error) {
    console.error("Error in booking action:", error.message);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Both Provider & User Cancel
const cancelBooking = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const userId = req.user?.id;

    const booking = await booking_service.findOne({
      where: { id: bookingId, userId },
    });

    if (!booking) {
      return res.status(404).json({ message: "Booking not found." });
    }

    if (booking.bookingStatus === "CANCELLED") {
      return res.status(400).json({ message: "Booking is already cancelled." });
    }

    // Refund process if payment done through wallet
    if (
      booking.paymentMethod === "WALLET" &&
      booking.paymentStatus === "COMPLETED"
    ) {
      const myWallet = await wallet.findOne({ where: { userId } });

      if (myWallet) {
        myWallet.balance += booking.finalAmount;
        await myWallet.save();

        await wallet_transaction.create({
          userId,
          amount: booking.finalAmount,
          type: "CREDIT",
          description: "Refund for cancelled booking",
        });
      }
    }

    // Update booking status
    booking.bookingStatus = "CANCELLED";
    booking.paymentStatus = "REFUNDED";
    await booking.save();

    return res.status(200).json({
      status: true,
      message: "Booking cancelled successfully.",
    });
  } catch (error) {
    console.error("Error cancelling booking:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
    });
  }
};

// Get User Booking with Status
const getUserBookings = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        status: false,
        message: "User is not authenticated.",
      });
    }

    const { status } = req.query;

    let whereCondition = { userId };

    if (status) {
      const allowedStatus = ["ACTIVE", "COMPLETED", "CANCELLED"];
      const upperStatus = status.toUpperCase();

      if (!allowedStatus.includes(upperStatus)) {
        return res.status(400).json({
          status: false,
          message: `Invalid status provided. Allowed statuses: ${allowedStatus.join(
            ", "
          )}.`,
        });
      }

      whereCondition.bookingStatus = upperStatus;
    }

    const bookings = await booking_service.findAll({
      where: whereCondition,
      attributes: [
        "id",
        "serviceDate",
        "numberOfWorker",
        "workHours",
        "amount",
        "taxesAndFees",
        "finalAmount",
        "paymentMethod",
        "paymentStatus",
        "bookingStatus",
        "approved",
        "startTime",
        "createdAt",
      ],
      include: [
        {
          model: subCategory_services,
          as: "service",
          attributes: [
            "serviceImages",
            "serviceName",
            "serviceDescription",
            "servicePrice",
          ],
        },
      ],
      order: [["createdAt", "DESC"]],
    });

    return res.status(200).json({
      status: true,
      message: "Bookings fetched successfully.",
      data: bookings,
    });
  } catch (error) {
    console.error("Error fetching bookings:", error);
    return res.status(500).json({
      status: false,
      message: "An error occurred while fetching bookings.",
      error: error.message,
    });
  }
};

// Booking Details
const getBookingDetailsById = async (req, res) => {
  try {
    const userId = req.user?.id;
    const bookingId = req.params.id;

    if (!userId) {
      return res.status(401).json({
        status: false,
        message: "User is not authenticated.",
      });
    }

    if (!bookingId) {
      return res.status(400).json({
        status: false,
        message: "Booking ID is required.",
      });
    }

    const booking = await booking_service.findOne({
      where: {
        id: bookingId,
        userId: userId, // Ensures user can only fetch their own bookings
      },
      attributes: [
        "id",
        "serviceDate",
        "numberOfWorker",
        "workHours",
        "amount",
        "taxesAndFees",
        "finalAmount",
        "paymentMethod",
        "paymentStatus",
        "bookingStatus",
        "approved",
        "startTime",
        "createdAt",
        "workingStatus", // Working status
        "startTimestamp", // Working start time 
        "completedAt" // Working completion time
      ],
      include: [
        {
          model: subCategory_services,
          as: "service",
          attributes: [
            "id",
            "providerId",
            "serviceName",
            "serviceDescription",
            "servicePrice",
            "serviceImages",
          ],
          include: [
            {
              model: user,
              as: "provider",
              attributes: ["id", "name", "email","companyaddress"],
            },
          ],
        },
        {
          model: booking_workers,
          as: "assignedWorkers",
          attributes: ["id", "assignedAt"],
          include: [
            {
              model: worker,
              as: "worker",
              attributes: ["id", "name", "email", "phone", "profile_image"],
            },
          ],
        },
      ],
    });

    if (!booking) {
      return res.status(404).json({
        status: false,
        message: "Booking not found.",
      });
    }

    const bookingJSON = booking.toJSON();

    const providerId = bookingJSON.service?.provider?.id;
    let averageRating = 0;
    let totalReviews = 0;
    
    if (providerId) {
      const providerReviews = await review_ratings.findAll({
        where: { providerId },
        attributes: ["rating"],
      });
    
      totalReviews = providerReviews.length;
    
      if (totalReviews > 0) {
        const sum = providerReviews.reduce((acc, cur) => acc + cur.rating, 0);
        averageRating = parseFloat((sum / totalReviews).toFixed(2));
      }
    
      bookingJSON.service.provider.averageRating = averageRating;
      bookingJSON.service.provider.totalReviews = totalReviews;
    }

    return res.status(200).json({
      status: true,
      message: "Booking details fetched successfully.",
      // data: booking,
      data: bookingJSON,

    });
  } catch (error) {
    console.error("Error fetching booking details:", error);
    return res.status(500).json({
      status: false,
      message: "An error occurred while fetching booking details.",
      error: error.message,
    });
  }
};

// Booking Status
const getBookingStatus = async (req, res) => {
  try {
    const { bookingId } = req.params;

    const booking = await booking_service.findByPk(bookingId);

    if (!booking) {
      return res.status(404).json({
        status: false,
        message: "Booking not found",
      });
    }

    return res.status(200).json({
      status: true,
      data: {
        bookingConfirmed: true, // always true if booking exists
        workerAssigned: booking.workerAssignStatus === "ASSIGNED",
        amountPaid: booking.paymentStatus === "COMPLETED",
        serviceCompleted: booking.bookingStatus === "COMPLETED",
      },
    });
  } catch (error) {
    console.error("Error fetching booking status:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

const getAssignedWorkers = async (req, res) => {
  try {
    const { bookingId } = req.params;

    if (!bookingId) {
      return res.status(400).json({
        status: false,
        message: "Booking ID is required",
      });
    }

    const assignedWorkers = await booking_workers.findAll({
      where: { bookingId },
      include: [
        {
          model: worker,
          as: "worker",
          attributes: [
            "id",
            "name",
            "email",
            "phone",
            "profile_image",
            "company_address",
          ],
        },
        {
          model: db.booking_service,
          as: "booking",
          attributes: [
            "id",
            "serviceName",
            "serviceDate",
            "numberOfWorker",
            "workerAssignStatus",
          ], // adjust as per your model
        },
      ],
      order: [["assignedAt", "DESC"]],
    });

    return res.status(200).json({
      status: true,
      message: "Assigned workers fetched successfully",
      data: assignedWorkers,
    });
  } catch (error) {
    console.error("Error fetching assigned workers:", error);
    return res.status(500).json({
      status: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

///// ** Provider---

// Get Bookings with Provider
const getProviderBookings = async (req, res) => {
  try {
    const providerId = req.user?.id;
    if (!providerId) {
      return res.status(401).json({
        status: false,
        message: "User is not authenticated.",
      });
    }

    const { status } = req.query;

    // Filter by providerId
    let whereCondition = { providerId };

    if (status) {
      const allowedStatus = ["ACTIVE", "COMPLETED", "CANCELLED", "REQUEST"];
      const upperStatus = status.toUpperCase();

      if (!allowedStatus.includes(upperStatus)) {
        return res.status(400).json({
          status: false,
          message: `Invalid status provided. Allowed statuses: ${allowedStatus.join(
            ", "
          )}.`,
        });
      }

      if (upperStatus === "REQUEST") {
        // whereCondition.approved = false;
        whereCondition = {
          approved: false,
          bookingStatus: "ACTIVE",
        };
      } else {
        whereCondition.bookingStatus = upperStatus;
        if (upperStatus === "ACTIVE") {
          whereCondition.approved = true;
        }
      }
    }

    const bookings = await booking_service.findAll({
      where: whereCondition,
      include: [
        {
          model: subCategory_services,
          as: "service",
          attributes: [
            "serviceImages",
            "serviceName",
            "serviceDescription",
            "servicePrice",
          ],
        },
        {
          model: user_locations,
          as: "location",
          attributes: ["id", "address", "latitude", "longitude", "isActive"],
        },
      ],
      order: [["createdAt", "DESC"]],
    });

    return res.status(200).json({
      status: true,
      message: "Provider's bookings fetched successfully.",
      data: bookings,
    });
  } catch (error) {
    console.error("Error fetching provider bookings:", error);
    return res.status(500).json({
      status: false,
      message: "An error occurred while fetching bookings.",
      error: error.message,
    });
  }
};

// Get Booking With Provider used Id Based
const getUserBookingDetailsById = async (req, res) => {
  try {
    const bookingId = req.params.id;

    if (!bookingId) {
      return res.status(400).json({
        status: false,
        message: "Booking ID is required.",
      });
    }

    const booking = await booking_service.findOne({
      where: {
        id: bookingId,
      },
      attributes: [
        "id",
        "serviceDate",
        "numberOfWorker",
        "workHours",
        "amount",
        "taxesAndFees",
        "finalAmount",
        "paymentMethod",
        "paymentStatus",
        "bookingStatus",
        "approved",
        "startTime",
        "createdAt",
      ],
      include: [
        {
          model: user,
          as: "user",
          attributes: ["id", "name", "email", "phone", "profile_image"],
        },
        {
          model: subCategory_services,
          as: "service",
          attributes: [
            "id",
            "providerId",
            "serviceName",
            "serviceDescription",
            "servicePrice",
            "serviceImages",
          ],
          include: [
            {
              model: user,
              as: "provider",
              attributes: ["id", "name", "email","companyaddress"],
            },
          ],
        },
        {
          model: booking_workers,
          as: "assignedWorkers",
          attributes: ["id", "assignedAt"],
          include: [
            {
              model: worker,
              as: "worker",
              attributes: ["id", "name", "email", "phone", "profile_image"],
            },
          ],
        },
        {
          model: user_locations,
          as: "location",
          attributes: ["id", "address", "latitude", "longitude", "isActive"],
        },
      ],
    });

    if (!booking) {
      return res.status(404).json({
        status: false,
        message: "Booking not found.",
      });
    }

    return res.status(200).json({
      status: true,
      message: "Booking details fetched successfully.",
      data: booking,
    });
  } catch (error) {
    console.error("Error fetching booking details:", error);
    return res.status(500).json({
      status: false,
      message: "An error occurred while fetching booking details.",
      error: error.message,
    });
  }
};

// Provider Approve Booking
const approveBookingRequest1 = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const providerId = req.user.id;

    const booking = await db.booking_service.findByPk(bookingId , {
      include: [
        {
          model: db.subCategory_services,
          as: "service",
          attributes: [
            "serviceName",
          ],
        },
      ],
    });

    if (!booking) {
      return res
        .status(404)
        .json({ status: false, message: "Booking not found" });
    }

    // Provider match check karo
    if (booking.providerId !== providerId) {
      return res.status(403).json({
        status: false,
        message: "You are not authorized to approve this booking",
      });
    }

    if (booking.approved) {
      return res
        .status(400)
        .json({ status: false, message: "Booking is already approved" });
    }

    // Update booking approval status
    await booking.update({ approved: true });

    const io = getSocketInstance();
    const connectedUsers = getConnectedUsers();

    const userMessage = `Your booking for package ${
      booking.service?.serviceName || "Service"
    } has been approved.`;

    // Create a message from admin to user
    const adminUser = await db.user.findOne({ where: { role: "Admin" } });

    if (!adminUser) {
      return res.status(500).json({
        status: false,
        message: "Admin not found",
      });
    }
    const ADMIN_ID = adminUser.id

    await db.message.create({
      senderId: ADMIN_ID,
      receiverId: booking.id,
      content: userMessage,
      messageType: "text",
    });

    // Real-time notification
    if (connectedUsers[booking.id]) {
      io.to(connectedUsers[booking.id]).emit("booking_approved", {
        message: userMessage,
        bookingId: booking.id,
      });
    } else {
      console.warn(
        `User ${booking.id} is not connected to receive real-time updates.`
      );
    }

    return res.status(200).json({
      status: true,
      message: "Booking request accepted successfully",
      data: booking,
    });
  } catch (error) {
    console.error("Error accepting booking:", error);
    return res.status(500).json({
      status: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

const approveBookingRequest = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const providerId = req.user.id;

    const booking = await db.booking_service.findByPk(bookingId, {
      include: [
        {
          model: db.subCategory_services,
          as: "service",
          attributes: [
            "serviceName",
          ],
        },
      ],
    });

    if (!booking) {
      return res.status(404).json({ status: false, message: "Booking not found" });
    }

    if (booking.providerId !== providerId) {
      return res.status(403).json({
        status: false,
        message: "You are not authorized to approve this booking",
      });
    }

    if (booking.approved) {
      return res.status(400).json({
        status: false,
        message: "Booking is already approved",
      });
    }

    await booking.update({ approved: true });

    const io = getSocketInstance();
    const connectedUsers = getConnectedUsers();

    const userMessage = `Your booking for package ${booking.service?.serviceName || "Service"} has been approved.`;

    const adminUser = await db.user.findOne({ where: { role: "Admin" } });
    if (!adminUser) {
      return res.status(500).json({ status: false, message: "Admin not found" });
    }

    await db.message.create({
      senderId: adminUser.id,
      receiverId: booking.userId,  // optional
      bookingId: booking.id,       // MAIN identifier
      content: userMessage,
      messageType: "text",
    });

    if (connectedUsers[booking.userId]) {
      io.to(connectedUsers[booking.userId]).emit("booking_approved", {
        message: userMessage,
        bookingId: booking.id,
      });
    }

    return res.status(200).json({
      status: true,
      message: "Booking request accepted successfully",
      data: booking,
    });
  } catch (error) {
    console.error("Error accepting booking:", error);
    return res.status(500).json({
      status: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

// Worker Assign----
// Multuple Assign Worker
const assignWorkerToBooking = async (req, res) => {
  const transaction = await db.sequelize.transaction(); //Begin transaction
  try {
    const { bookingId } = req.params;
    const { workerIds } = req.body;

    console.log(req.body,workerIds)
    if (!workerIds || !Array.isArray(workerIds) || workerIds.length === 0) {
      return res.status(400).json({
        status: false,
        message: "Worker IDs are required in an array",
      });
    }

    const booking = await booking_service.findByPk(bookingId, {
      transaction,
    });

    if (!booking) {
      await transaction.rollback();
      return res.status(404).json({
        status: false,
        message: "Booking not found",
      });
    }

    // Check already assigned workers
    const existingAssignedCount = await booking_workers.count({
      where: { bookingId },
      transaction,
    });

    const remainingSlots = booking.numberOfWorker - existingAssignedCount;

    if (workerIds.length > remainingSlots) {
      await transaction.rollback();
      return res.status(400).json({
        status: false,
        message: `Only ${remainingSlots} worker(s) can be assigned. ${existingAssignedCount} already assigned.`,
      });
    }

    const validWorkers = await worker.findAll({
      where: {
        id: workerIds,
        providerId: booking.providerId,
      },
      transaction,
    });

    if (validWorkers.length !== workerIds.length) {
      await transaction.rollback();
      return res.status(400).json({
        status: false,
        message: "Some workers are invalid or do not belong to the provider",
      });
    }

    const workersData = workerIds.map((workerId) => ({
      bookingId: booking.id,
      workerId,
    }));

    // Bulk insert with transaction
    await booking_workers.bulkCreate(workersData, { transaction });

    // Update booking field safely
    // If total now matches required, update status
    if (existingAssignedCount + workerIds.length === booking.numberOfWorker) {
      booking.workerAssignStatus = "ASSIGNED";
      await booking.save({ transaction });
    }

    await transaction.commit(); // All success transaction commit

    return res.status(200).json({
      status: true,
      message: "Workers assigned successfully",
      data: {
        bookingId: booking.id,
        assignedWorkerIds: workerIds,
      },
    });
  } catch (error) {
    console.error("Error assigning workers:", error);
    await transaction.rollback(); // Error rollback changes
    return res.status(500).json({
      status: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

// Single Assign Worker
const assignSingleWorker = async (req, res) => {
  const transaction = await db.sequelize.transaction();
  try {
    const { bookingId } = req.params;
    const { workerId } = req.body;

    if (!workerId) {
      return res.status(400).json({
        status: false,
        message: "Worker ID is required",
      });
    }

    const booking = await booking_service.findByPk(bookingId, {
      transaction,
    });

    if (!booking) {
      await transaction.rollback();
      return res.status(404).json({
        status: false,
        message: "Booking not found",
      });
    }

    const workers = await worker.findOne({
      where: {
        id: workerId,
        providerId: booking.providerId,
      },
      transaction,
    });

    if (!workers) {
      await transaction.rollback();
      return res.status(400).json({
        status: false,
        message: "Invalid worker or not owned by provider",
      });
    }

    // Count already assigned workers
    const currentCount = await booking_workers.count({
      where: { bookingId: booking.id },
      transaction,
    });

    if (booking.numberOfWorker && currentCount >= booking.numberOfWorker) {
      await transaction.rollback();
      return res.status(400).json({
        status: false,
        message: `Cannot assign more than ${booking.numberOfWorker} workers`,
      });
    }

    // Check if already assigned
    const alreadyAssigned = await booking_workers.findOne({
      where: {
        bookingId: booking.id,
        workerId: workerId,
      },
      transaction,
    });

    if (alreadyAssigned) {
      await transaction.rollback();
      return res.status(400).json({
        status: false,
        message: "Worker already assigned to this booking",
      });
    }

    // Assign worker
    await booking_workers.create(
      {
        bookingId: booking.id,
        workerId,
      },
      { transaction }
    );

    // Optionally update status if fully assigned
    const totalAfter = currentCount + 1;
    if (booking.numberOfWorker && totalAfter === booking.numberOfWorker) {
      booking.workerAssignStatus = "ASSIGNED";
      await booking.save({ transaction });
    }

    await transaction.commit();
    return res.status(200).json({
      status: true,
      message: "Worker assigned successfully",
      data: {
        bookingId: booking.id,
        workerId,
      },
    });
  } catch (error) {
    await transaction.rollback();
    console.error("Error:", error);
    return res.status(500).json({
      status: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};


///** ADMIN ---- */
const getBookingOverAllHistoryByUserId__Test = async (req, res) => {
  try {
    const userId = req.params.id;

    if (!userId) {
      return res.status(401).json({
        status: false,
        message: "User ID is required.",
      });
    }


    const booking = await booking_service.findAll({
      where: {
        userId: userId,
      },
      attributes: [
        "id",
        "serviceDate",
        // "numberOfWorker",
        "workHours",
        "amount",
        // "taxesAndFees",
        "finalAmount",
        // "paymentMethod",
        // "paymentStatus",
        "bookingStatus",
        // "approved",
        // "startTime",
        "createdAt",
      ],
      include: [
        {
          model: subCategory_services,
          as: "service",
          attributes: [
            // "id",
            // "providerId",
            "serviceName",
            // "serviceDescription",
            "servicePrice",
            // "serviceImages",
          ],
          include: [
            {
              model: user,
              as: "provider",
              attributes: [
                // "id", 
                "name", 
                // "email"
              ],
            },
          ],
        },
        // {
        //   model: booking_workers,
        //   as: "assignedWorkers",
        //   attributes: ["id", "assignedAt"],
        //   include: [
        //     {
        //       model: worker,
        //       as: "worker",
        //       attributes: ["id", "name", "email", "phone", "profile_image"],
        //     },
        //   ],
        // },
      ],
    });

    if (!booking) {
      return res.status(404).json({
        status: false,
        message: "Booking not found.",
      });
    }

    return res.status(200).json({
      status: true,
      message: "Booking details fetched successfully.",
      data: booking,
    });
  } catch (error) {
    console.error("Error fetching booking details:", error);
    return res.status(500).json({
      status: false,
      message: "An error occurred while fetching booking details.",
      error: error.message,
    });
  }
};

const getBookingOverAllHistoryByUserId = async (req, res) => {
  try {
    const userId = req.params.id;
    let { page = 1, limit = 10, serviceName, bookingStatus, startDate, endDate } = req.query;

    if (!userId) {
      return res.status(400).json({
        status: false,
        message: "User ID is required.",
      });
    }

    // Convert to numbers
    page = parseInt(page);
    limit = parseInt(limit);
    const offset = (page - 1) * limit;

    // Base where clause for bookings
    const whereClause = {
      userId: userId,
    };

    // Optional: filter by booking status
    if (bookingStatus) {
      whereClause.bookingStatus = bookingStatus;
    }

    // Optional: filter by date range
    if (startDate || endDate) {
      whereClause.createdAt = {};
      if (startDate) whereClause.createdAt[Op.gte] = new Date(startDate);
      if (endDate) whereClause.createdAt[Op.lte] = new Date(endDate);
    }

    // Include clause with search inside serviceName
    const includeClause = [
      {
        model: subCategory_services,
        as: "service",
        attributes: ["serviceName", "servicePrice"],
        where: serviceName
          ? {
              serviceName: {
                [Op.iLike]: `%${serviceName}%`,
              },
            }
          : undefined,
        include: [
          {
            model: user,
            as: "provider",
            attributes: ["name"],
          },
        ],
      },
    ];

    // Total count for pagination
    const totalCount = await booking_service.count({
      where: whereClause,
      include: includeClause,
    });

    const booking = await booking_service.findAll({
      where: whereClause,
      attributes: [
        "id",
        "serviceDate",
        "workHours",
        "amount",
        "finalAmount",
        "bookingStatus",
        "createdAt",
      ],
      include: includeClause,
      offset,
      limit,
      order: [["createdAt", "DESC"]],
    });

    return res.status(200).json({
      status: true,
      message: "Booking details fetched successfully.",
      currentPage: page,
      totalPages: Math.ceil(totalCount / limit),
      totalCount,
      data: booking,
    });
  } catch (error) {
    console.error("Error fetching booking details:", error);
    return res.status(500).json({
      status: false,
      message: "An error occurred while fetching booking details.",
      error: error.message,
    });
  }
};

const getBookingDetailsByUserId = async (req, res) => {
  try {
    const userId = req.params.id;

    if (!userId) {
      return res.status(401).json({
        status: false,
        message: "User ID is required.",
      });
    }


    const booking = await booking_service.findOne({
      where: {
        userId: userId,
      },
      attributes: [
        "id",
        "serviceDate",
        "numberOfWorker",
        "workHours",
        "amount",
        "taxesAndFees",
        "finalAmount",
        "paymentMethod",
        "paymentStatus",
        "bookingStatus",
        "approved",
        "startTime",
        "createdAt",
      ],
      include: [
        {
          model: subCategory_services,
          as: "service",
          attributes: [
            "id",
            "providerId",
            "serviceName",
            "serviceDescription",
            "servicePrice",
            "serviceImages",
          ],
          include: [
            {
              model: user,
              as: "provider",
              attributes: ["id", "name", "email"],
            },
          ],
        },
        {
          model: booking_workers,
          as: "assignedWorkers",
          attributes: ["id", "assignedAt"],
          include: [
            {
              model: worker,
              as: "worker",
              attributes: ["id", "name", "email", "phone", "profile_image"],
            },
          ],
        },
      ],
    });

    if (!booking) {
      return res.status(404).json({
        status: false,
        message: "Booking not found.",
      });
    }

    return res.status(200).json({
      status: true,
      message: "Booking details fetched successfully.",
      data: booking,
    });
  } catch (error) {
    console.error("Error fetching booking details:", error);
    return res.status(500).json({
      status: false,
      message: "An error occurred while fetching booking details.",
      error: error.message,
    });
  }
};

const getProviderIdBookings = async (req, res) => {
  try {
   const { providerId } = req.params;

    if (!providerId) {
      return res.status(400).json({
        status: false,
        message: "providerId is required in params.",
      });
    }

    const { searchText = "", page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;
    // Filter by providerId
    const whereCondition = {
      providerId,
    };
    
    const userWhere = {};
    const serviceWhere = {};
    if (searchText) {
      whereCondition[Op.or] = [
        { '$user.name$': { [Op.iLike]: `%${searchText}%` } },
        { '$service.serviceName$': { [Op.iLike]: `%${searchText}%` } }
      ];
    }

    const { rows: bookings, count: totalCount } = await booking_service.findAndCountAll({
      where: whereCondition,
      include: [
        {
          model: subCategory_services,
          as: "service",
          attributes: [
            "serviceImages",
            "serviceName",
            "serviceDescription",
            "servicePrice",
          ],
        },
        {
          model: user,
          as: "user",
          attributes: [
            "id",
            "name",
            "email",
          ],
        },
      ],
      order: [["createdAt", "DESC"]],
      limit: parseInt(limit),
      offset: parseInt(offset),
    });

    const totalPages = Math.ceil(totalCount / limit);

    return res.status(200).json({
      status: true,
      message: "Provider's bookings fetched successfully.",
      data: bookings,
      totalCount,
      page: parseInt(page),
      totalPages,
    });
  } catch (error) {
    console.error("Error fetching provider bookings:", error);
    return res.status(500).json({
      status: false,
      message: "An error occurred while fetching bookings.",
      error: error.message,
    });
  }
};

const getBookingDetailById = async (req, res) => {
  try {
    const bookingId = req.params.bookingId;

    if (!bookingId) {
      return res.status(401).json({
        status: false,
        message: "Booking ID is required.",
      });
    }


    const booking = await booking_service.findOne({
      where: {
        id: bookingId,
      },
      attributes: [
        "id",
        "serviceDate",
        "numberOfWorker",
        "workHours",
        "amount",
        "taxesAndFees",
        "finalAmount",
        "paymentMethod",
        "paymentStatus",
        "bookingStatus",
        "approved",
        "startTime",
        "createdAt",
      ],
      include: [
        {
          model: subCategory_services,
          as: "service",
          attributes: [
            "id",
            "providerId",
            "serviceName",
            "serviceDescription",
            "servicePrice",
            "serviceImages",
          ],
          include: [
            {
              model: user,
              as: "provider",
              attributes: ["id", "name", "email"],
            },
          ],
        },
        {
          model: booking_workers,
          as: "assignedWorkers",
          attributes: ["id", "assignedAt"],
          include: [
            {
              model: worker,
              as: "worker",
              attributes: ["id", "name", "email", "phone", "profile_image"],
            },
          ],
        },
      ],
    });

    if (!booking) {
      return res.status(404).json({
        status: false,
        message: "Booking not found.",
      });
    }

    return res.status(200).json({
      status: true,
      message: "Booking details fetched successfully.",
      data: booking,
    });
  } catch (error) {
    console.error("Error fetching booking details:", error);
    return res.status(500).json({
      status: false,
      message: "An error occurred while fetching booking details.",
      error: error.message,
    });
  }
};

module.exports = {
  confirmCashPayment, // Cash Payment
  addBooking,
  bookingAction,
  cancelBooking,
  getUserBookings,
  getBookingDetailsById,
  getBookingStatus,
  getAssignedWorkers,
  // Provider ---
  getProviderBookings,
  approveBookingRequest,
  assignWorkerToBooking, // Multiple Assign
  assignSingleWorker, // Single Assign
  getUserBookingDetailsById,

  // ADMIN --- 
  getBookingOverAllHistoryByUserId, //user id base All Booking   //admin.routes.js
  getBookingDetailById,//booking id base get Booking   //admin.routes.js
  getBookingDetailsByUserId,  //user id base Booking   //admin.routes.js
  getProviderIdBookings,  //provider id base Booking  //admin.routes.js
};
