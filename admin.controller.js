const db = require("../database/db");
require("dotenv").config();
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
  categories,
  app_performances,
  user_notification,
  user_session,
  promo_redemption,
  help_support,
} = db;
const { validationResult } = require("express-validator");
const { Op, Sequelize, fn, col, literal } = require("sequelize");
const moment = require("moment");
// const { getPerformanceReport } = require("../middleware/performanceLogger");

const getAdminDashboard = async (req, res) => {
  try {
    // Count all users
    const totalUsers = await user.count({ where: { role: "User" } });

    // Count all vendors/providers
    const totalVendors = await user.count({ where: { role: "Provider" } });

    // Count total bookings
    const totalBookings = await booking_service.count();

    //  Sum total revenue (only completed payments)
    const totalRevenueData = await booking_service.findAll({
      where: { paymentStatus: "COMPLETED" },
      attributes: [
        [
          db.Sequelize.fn("SUM", db.Sequelize.col("finalAmount")),
          "totalRevenue",
        ],
      ],
      raw: true,
    });

    const totalRevenue = parseFloat(
      totalRevenueData[0]?.totalRevenue || 0
    ).toFixed(2);

    return res.status(200).json({
      status: true,
      message: "Admin dashboard stats fetched successfully.",
      data: {
        totalUsers,
        totalVendors,
        totalBookings,
        totalRevenue,
      },
    });
  } catch (error) {
    console.error("Error fetching admin dashboard stats:", error.message);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

const getAllUser = async (req, res) => {
  try {
    let { searchText = "", page = 1, limit = 10 } = req.query;

    page = parseInt(page);
    limit = parseInt(limit);

    // Validate page and limit to avoid invalid queries
    if (isNaN(page) || page < 1) page = 1;
    if (isNaN(limit) || limit < 1) limit = 10;

    const offset = (page - 1) * limit;

    // Build the where condition with role and optional search
    const whereCondition = {
      role: "User",
      ...(searchText.trim() && {
        name: { [Op.iLike]: `%${searchText.trim()}%` },
      }),
    };

    const { rows: users, count: totalCount } = await user.findAndCountAll({
      where: whereCondition,
      attributes: [
        "id",
        "name",
        "phone",
        "email",
        "isApproved",
        "profile_image",
        "createdAt",
      ],
      order: [["createdAt", "DESC"]],
      limit,
      offset,
    });

    const totalPages = Math.ceil(totalCount / limit);

    return res.status(200).json({
      status: true,
      message: "Users fetched successfully",
      data: users,
      totalCount,
      page,
      totalPages,
    });
  } catch (error) {
    return res.status(500).json({
      status: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

const getAllVendor = async (req, res) => {
  try {
    let { searchText = "", page = 1, limit = 10 } = req.query;

    page = parseInt(page);
    limit = parseInt(limit);

    // Validate page and limit to avoid invalid queries
    if (isNaN(page) || page < 1) page = 1;
    if (isNaN(limit) || limit < 1) limit = 10;

    const offset = (page - 1) * limit;

    // Build the where condition with role and optional search
    const whereCondition = {
      role: "Provider",
      ...(searchText.trim() && {
        name: { [Op.iLike]: `%${searchText.trim()}%` },
      }),
    };

    // Get total count first for pagination
    const totalCount = await user.count({ where: whereCondition });

    const vendors = await user.findAll({
      where: whereCondition,
      attributes: [
        "id",
        "name",
        "phone",
        "email",
        "profile_image",
        "companyname",
        "companyaddress",
        "createdAt",
      ],
      include: [
        {
          model: categories,
          as: "category",
          attributes: ["categoryName"], // only fetch category name
        },
      ],
      order: [["createdAt", "DESC"]], // Optional: latest users first
      limit,
      offset,
    });

    const totalPages = Math.ceil(totalCount / limit);

    return res.status(200).json({
      status: true,
      message: "Vendor fetched successfully",
      data: vendors,
      totalCount,
      page,
      totalPages,
    });
  } catch (error) {
    return res.status(500).json({
      status: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

const getVendoreDashbord = async (req, res) => {
  try {
    const { providerId } = req.params;

    if (!providerId) {
      return res.status(400).json({
        status: false,
        message: "providerId is required in params.",
      });
    }

    // Booking Stats
    const [
      activeCount,
      completedCount,
      todayRevenueResult,
      overallRevenueResult,
    ] = await Promise.all([
      booking_service.count({
        where: {
          providerId,
          bookingStatus: "ACTIVE",
        },
      }),
      booking_service.count({
        where: {
          providerId,
          bookingStatus: "COMPLETED",
        },
      }),
      booking_service.sum("finalAmount", {
        where: {
          providerId,
          bookingStatus: "COMPLETED",
          createdAt: {
            [Op.gte]: moment().startOf("day").toDate(),
            [Op.lte]: moment().endOf("day").toDate(),
          },
        },
      }),
      booking_service.sum("finalAmount", {
        where: {
          providerId,
          bookingStatus: "COMPLETED",
        },
      }),
    ]);

    return res.status(200).json({
      status: true,
      message: "Provider services fetched successfully.",
      data: {
        activeServiceCount: activeCount,
        completedServiceCount: completedCount,
        todayRevenue: todayRevenueResult || 0,
        overallRevenue: overallRevenueResult || 0,
      },
    });
  } catch (error) {
    console.error("Get Provider Services Error:", error.message);
    return res.status(500).json({
      status: false,
      message: "Internal server error while fetching services.",
      error: error.message,
    });
  }
};

const getUserDetails = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({
        status: false,
        message: "User ID is required.",
      });
    }

    const singleUser = await user.findOne({
      where: { id },
      attributes: { exclude: ["password"] },
      include: [
        {
          model: wallet,
          as: "wallet",
          attributes: ["balance"],
        },
        {
          model: user_locations,
          as: "user_locations",
          where: { isActive: true },
          required: false,
          limit: 1,
          order: [["createdAt", "DESC"]],
          attributes: ["address"],
        },
      ],
    });

    if (!singleUser) {
      return res.status(404).json({
        status: false,
        message: "User not found.",
      });
    }

    // Convert to plain object
    const userData = singleUser.toJSON();

    // Extract balance and address
    const balance = userData.wallet?.balance || 0;
    const address = userData.user_locations?.[0]?.address || null;

    // Clean final response (removing wallet and user_locations from original)
    delete userData.wallet;
    delete userData.user_locations;

    return res.status(200).json({
      status: true,
      message: "User details fetched successfully.",
      // data: singleUser,
      data: {
        ...userData,
        wallet: balance,
        location: address,
      },
    });
  } catch (error) {
    console.error("Error fetching user details:", error.message);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

const toggleUserStatus = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        status: false,
        message: "A valid id is required in params.",
      });
    }

    const users = await user.findByPk(id);

    if (!users) {
      return res.status(404).json({
        status: false,
        message: "users not found.",
      });
    }

    // Toggle isApproved value
    const updatedStatus = !users.isApproved;

    await user.update(
      { isApproved: updatedStatus },
      { where: { id: id } }
    );

    return res.status(200).json({
      status: true,
      message: `User status toggled to ${updatedStatus ? "Active" : "Inactive"} successfully!`,
      data: { isApproved: updatedStatus }
    });
  } catch (error) {
    console.error("User Update Error:", error);
    return res.status(500).json({
      status: false,
      error: "Internal server error",
      details: error.message,
    });
  }
};

const toggleUserStatus1 = async (req, res) => {
  try {
    const { id } = req.params;
 
    if (!id) {
      return res.status(400).json({
        status: false,
        message: "A valid id is required in params.",
      });
    }
 
    const users = await user.findByPk(id);
 
    if (!users) {
      return res.status(404).json({
        status: false,
        message: "User not found.",
      });
    }
 
    // Toggle isApproved
    const updatedStatus = !users.isApproved;
 
    await user.update(
      { isApproved: updatedStatus },
      { where: { id } }
    );
 
    // ✅ Re-fetch updated user
    const updatedUser = await user.findByPk(id);
 
    return res.status(200).json({
      status: true,
      message: `User status toggled to ${updatedStatus ? "Active" : "Inactive"} successfully!`,
      data: updatedUser, // ✅ Return full updated user
    });
  } catch (error) {
    console.error("User Update Error:", error);
    return res.status(500).json({
      status: false,
      error: "Internal server error",
      details: error.message,
    });
  }
};

const getAllBookingsHistory = async (req, res) => {
  try {
    const { userId, page = 1, limit = 20 } = req.query;

    let whereCondition = {};

    if (userId) {
      whereCondition.userId = userId;
    }

    const offset = (page - 1) * limit;

    const bookings = await booking_service.findAndCountAll({
      where: whereCondition,
      attributes: ["id", "createdAt"],
      include: [
        {
          model: subCategory_services,
          as: "service",
          attributes: ["serviceName", "providerId"],
          include: [
            {
              model: user,
              as: "provider",
              attributes: ["name"],
            },
          ],
        },
        {
          model: user,
          as: "user",
          attributes: ["name"],
        },
      ],
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [["createdAt", "DESC"]],
    });

    // Transform response: show only required fields
    const simplifiedData = bookings.rows.map((booking) => {
      const formattedDate = new Date(booking.createdAt)
        .toISOString()
        .split("T")[0]; // 'YYYY-MM-DD'

      return {
        date: formattedDate,
        bookingId: booking.id,
        customerName: booking.user?.name || "N/A",
        serviceProvider: booking.service?.provider?.name || "N/A",
        serviceType: booking.service?.serviceName || "N/A",
      };
    });

    return res.status(200).json({
      status: true,
      message: "Bookings fetched successfully.",
      data: simplifiedData,
      total: bookings.count,
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (error) {
    console.error("Error fetching bookings for admin:", error.message);
    return res.status(500).json({
      status: false,
      message: "An error occurred while fetching bookings.",
      error: error.message,
    });
  }
};

// Logic Not Included for the following functions
const getCustomerActivity = async (req, res) => {
  try {
    let { startDate, endDate, page = 1, limit = 10 } = req.query;

    if (!startDate && !endDate) {
      startDate = moment().subtract(7, "days").format("YYYY-MM-DD");
      endDate = moment().format("YYYY-MM-DD");
    }
    if (!startDate) startDate = endDate;
    if (!endDate) endDate = startDate;

    const start = moment.utc(startDate, "YYYY-MM-DD").startOf("day");
    const end = moment.utc(endDate, "YYYY-MM-DD").endOf("day");
    const totalDays = end.diff(start, "days") + 1;

    // Fetch all relevant data
    const [allUsers, allSessions, allBookings] = await Promise.all([
      user.findAll({ raw: true }),
      user_session.findAll({ raw: true }),
      booking_service.findAll({ raw: true }),
    ]);

    // Build cumulative user map
    const totalCustomersSet = new Set();

    const resultsMap = {};

    for (let i = 0; i < totalDays; i++) {
      const date = start.clone().add(i, "days");
      const dateStr = date.format("YYYY-MM-DD");

      const newRegs = allUsers.filter(
        (u) => moment.utc(u.createdAt).format("YYYY-MM-DD") === dateStr
      );
      newRegs.forEach((u) => totalCustomersSet.add(u.id));

      const active = new Set(
        allSessions
          .filter(
            (s) => moment.utc(s.loginTime).format("YYYY-MM-DD") === dateStr
          )
          .map((s) => s.userId)
      );

      const repeat = new Set(
        allBookings
          .filter((b) => {
            const bDate = moment.utc(b.createdAt).format("YYYY-MM-DD");
            return (
              bDate === dateStr && !newRegs.find((nu) => nu.id === b.userId)
            );
          })
          .map((b) => b.userId)
      );

      resultsMap[dateStr] = {
        date: dateStr,
        newRegistrations: newRegs.length,
        activeUsers: active.size,
        repeatCustomers: repeat.size,
        totalCustomers: totalCustomersSet.size,
      };
    }

    const allResults = Object.values(resultsMap).sort(
      (a, b) => new Date(b.date) - new Date(a.date)
    );
    const paginated = allResults.slice((page - 1) * limit, page * limit);

    res.status(200).json({
      status: true,
      data: paginated,
      total: allResults.length,
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (error) {
    console.error("Customer Activity Report Error:", error.message);
    res.status(500).json({ status: false, message: error.message });
  }
};

const getCustomerFeedbackReport = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    // Fetch all reviews with count for pagination
    const reviewsList = await review_ratings.findAndCountAll({
      include: [
        {
          model: user,
          as: "users",
          attributes: ["id", "name", "email"],
        },
        {
          model: user,
          as: "provider",
          attributes: ["id", "name", "email"],
        },
      ],
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [["createdAt", "DESC"]],
    });

    const totalReviews = reviewsList.count;

    // Format simplified response
    const simplifiedData = reviewsList.rows.map((review) => {
      const formattedDate = new Date(review.createdAt)
        .toISOString()
        .split("T")[0];

      return {
        date: formattedDate,
        reviewId: review.id,
        customerName: review.users?.name || "N/A",
        serviceProvider: review.provider?.name || "N/A",
        rating: review.rating || "N/A",
        review: review.review || "N/A",
      };
    });

    return res.status(200).json({
      status: true,
      message: "Reviews fetched successfully.",
      data: simplifiedData,
      total: totalReviews,
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (error) {
    console.error("Get Reviews Error:", error.message);
    return res.status(500).json({
      status: false,
      message: "Internal server error while fetching reviews.",
      error: error.message,
    });
  }
};

// Marketing
const getPromoCampaignReport = async (req, res) => {
  try {
    const offers = await promo_offer.findAll({
      include: [
        {
          model: promo_redemption, // a model that links promo_offer to actual redemptions
          attributes: ["id", "discountAmount", "createdAt"],
          as: "redemptions",
        },
      ],
    });

    const report = offers.map((offer) => {
      const redemptions = offer.redemptions || [];

      const totalRedemptions = redemptions.length;

      const revenueImpact = redemptions.reduce((sum, r) => {
        return sum + (r.discountAmount || 0);
      }, 0);

      const dates = redemptions.map((r) => r.createdAt);
      const startDate = dates.length ? new Date(Math.min(...dates)) : null;
      const endDate = dates.length ? new Date(Math.max(...dates)) : null;

      return {
        campaignName: offer.offerCode,
        discountType: offer.discountType,
        totalRedemptions,
        revenueImpact: revenueImpact.toFixed(2),
        duration:
          startDate && endDate
            ? `${startDate.toDateString()} - ${endDate.toDateString()}`
            : "N/A",
      };
    });

    return res.status(200).json({
      status:true,
      data: report,
    });
  } catch (error) {
    console.error("Promo Campaign Report Error:", error.message);
    return res.status(500).json({
      status: false,
      message: error.message,
    });
  }
};

const getUserEngagementReport = async (req, res) => {
  try {
    let { startDate, endDate, page = 1, limit = 10 } = req.query;

    // Handle optional dates
    if (!startDate && !endDate) {
      startDate = moment().subtract(7, "days").format("YYYY-MM-DD");
      endDate = moment().format("YYYY-MM-DD");
    }
    if (!startDate) startDate = endDate;
    if (!endDate) endDate = startDate;

    const start = moment(startDate).startOf("day");
    const end = moment(endDate).endOf("day");

    const totalDays = end.diff(start, "days") + 1;

    // Bulk fetch data for range
    const [allSessions, allUsers, allBookings] = await Promise.all([
      user_session.findAll({
        where: {
          loginTime: {
            [Op.between]: [start.toDate(), end.toDate()],
          },
        },
        raw: true,
      }),
      user.findAll({
        where: {
          createdAt: {
            [Op.between]: [start.toDate(), end.toDate()],
          },
        },
        raw: true,
      }),
      booking_service.findAll({
        where: {
          createdAt: {
            [Op.between]: [start.toDate(), end.toDate()],
          },
        },
        raw: true,
      }),
    ]);

    // Group & calculate
    const resultsMap = {};

    for (let i = 0; i < totalDays; i++) {
      const date = moment(start).add(i, "days").format("YYYY-MM-DD");
      resultsMap[date] = {
        date,
        activeUsers: new Set(),
        newUsers: 0,
        totalDuration: 0,
        sessionCount: 0,
        started: 0,
        completed: 0,
      };
    }

    // Process sessions
    allSessions.forEach((s) => {
      const date = moment(s.loginTime).format("YYYY-MM-DD");
      if (resultsMap[date]) {
        resultsMap[date].activeUsers.add(s.userId);
        if (s.logoutTime) {
          const duration =
            (new Date(s.logoutTime) - new Date(s.loginTime)) / 1000;
          resultsMap[date].totalDuration += duration;
          resultsMap[date].sessionCount += 1;
        }
      }
    });

    // Process new users
    allUsers.forEach((u) => {
      const date = moment(u.createdAt).format("YYYY-MM-DD");
      if (resultsMap[date]) {
        resultsMap[date].newUsers += 1;
      }
    });

    // Process bookings
    allBookings.forEach((b) => {
      const date = moment(b.createdAt).format("YYYY-MM-DD");
      if (resultsMap[date]) {
        // resultsMap[date].started += 1;
        if (b.bookingStatus !== "CANCELLED") {
          resultsMap[date].started += 1;
        }
        if (b.bookingStatus === "COMPLETED") {
          resultsMap[date].completed += 1;
        }
      }
    });

    // Prepare final result
    const allResults = Object.values(resultsMap)
      .sort((a, b) => new Date(b.date) - new Date(a.date)) // latest first
      .map((r) => {
        const dropOff =
          r.started > 0
            ? (((r.started - r.completed) / r.started) * 100).toFixed(2)
            : "0.00";
        const avgDuration =
          r.sessionCount > 0
            ? new Date((r.totalDuration / r.sessionCount) * 1000)
                .toISOString()
                .substr(11, 8)
            : "00:00:00";

        return {
          date: r.date,
          activeUsers: r.activeUsers.size,
          newUsers: r.newUsers,
          averageSessionDuration: avgDuration,
          dropOffRate: `${dropOff}%`,
        };
      });

    const paginated = allResults.slice((page - 1) * limit, page * limit);

    return res.status(200).json({
      status: true,
      data: paginated,
      total: allResults.length,
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (error) {
    console.error("Error generating engagement report:", error.message);
    res.status(500).json({ status: false, message: error.message });
  }
};

const getPushNotificationReport = async (req, res) => {
  try {
    const notifications = await user_notification.findAll();

    const grouped = {};

    notifications.forEach((n) => {
      const date = n.createdAt.toISOString().split("T")[0];
      const key = `${n.title}-${date}`;

      if (!grouped[key]) {
        grouped[key] = {
          title: n.title,
          sentDate: date,
          totalSent: 0,
          totalOpened: 0,
          totalClicked: 0,
          totalConverted: 0,
        };
      }

      grouped[key].totalSent += 1;
      if (n.read) grouped[key].totalOpened += 1;
      if (n.clicked) grouped[key].totalClicked += 1;
      if (n.converted) grouped[key].totalConverted += 1;
    });

    const report = Object.values(grouped).map((item) => {
      const openRate = ((item.totalOpened / item.totalSent) * 100).toFixed(2);
      const clickRate = ((item.totalClicked / item.totalSent) * 100).toFixed(2);
      const conversionRate = (
        (item.totalConverted / item.totalSent) *
        100
      ).toFixed(2);

      return {
        title: item.title,
        sentDate: item.sentDate,
        openRate: openRate,
        clickThroughRate: clickRate,
        conversionRate: conversionRate,
      };
    });

    res.status(200).json({ status: true, data: report });
  } catch (error) {
    console.error("Push Notification Report Error:", error.message);
    res.status(500).json({ status: false, message: "Internal Server Error" });
  }
};

// Services
const getProviderPerformanceReport = async (req, res) => {
  try {
    let { startDate, endDate, page = 1, limit = 10 } = req.query;

    // Convert to numbers
    page = parseInt(page);
    limit = parseInt(limit);
    const offset = (page - 1) * limit;

    const whereClause = {};

    // If date filters are provided
    if (startDate || endDate) {
      whereClause.date = {};
      if (startDate) whereClause.date[Op.gte] = new Date(startDate);
      if (endDate) whereClause.date[Op.lte] = new Date(endDate);
    }

    // Count total approved providers
    const totalCount = await user.count({
      where: { role: "Provider", isApproved: true },
    });

    // Apply pagination to provider fetch
    const providers = await user.findAll({
      where: { role: "Provider", isApproved: true },
      attributes: ["id", "name", "email"],
      limit,
      offset,
    });

    const report = await Promise.all(
      providers.map(async (provider) => {
        const bookings = await booking_service.findAll({
          where: {
            providerId: provider.id,
            ...whereClause,
          },
          attributes: ["bookingStatus", "finalAmount"],
        });

        const totalBookings = bookings.length;
        const completed = bookings.filter(
          (b) => b.bookingStatus === "COMPLETED"
        ).length;
        const cancelled = bookings.filter(
          (b) => b.bookingStatus === "CANCELLED"
        ).length;
        const earnings = bookings
          .filter((b) => b.bookingStatus === "COMPLETED")
          .reduce((acc, curr) => acc + (curr.finalAmount || 0), 0);

        return {
          providerId: provider.id,
          providerName: provider.name,
          email: provider.email,
          totalBookings,
          completed,
          cancelled,
          earnings: earnings.toFixed(2),
        };
      })
    );

    return res.status(200).json({
      status: true,
      message: "Service Provider Performance Report generated.",
      data: report,
      page: page,
      totalPages: Math.ceil(totalCount / limit),
      totalCount,
    });
  } catch (error) {
    console.error("Error generating performance report:", error.message);
    return res.status(500).json({
      status: false,
      message: "Error generating provider report.",
      error: error.message,
    });
  }
};

const getPayoutReport = async (req, res) => {
  try {
    const { page = 1, limit = 10, searchText = "" } = req.query;
    const offset = (page - 1) * limit;

    const whereCondition = {
      paymentStatus: "COMPLETED", // Only show completed payouts
    };

    if (searchText) {
      whereCondition[Op.or] = [
        { "$provider.name$": { [Op.iLike]: `%${searchText}%` } },
        literal(
          `CAST("booking_service"."paymentMethod" AS TEXT) ILIKE '%${searchText}%'`
        ),
      ];
    }

    const { rows: payouts, count: totalCount } =
      await booking_service.findAndCountAll({
        where: whereCondition,
        include: [
          {
            model: user,
            as: "provider",
            attributes: ["id", "name"],
          },
        ],
        order: [["createdAt", "DESC"]],
        limit: parseInt(limit),
        offset: parseInt(offset),
      });

    const formattedData = payouts.map((payout) => ({
      date: payout.createdAt.toISOString().split("T")[0],
      providerName: payout.provider?.name || "N/A",
      amount: payout.finalAmount?.toFixed(2) || "0.00",
      paymentMethod: payout.paymentMethod,
      status: payout.paymentStatus,
    }));

    const totalPages = Math.ceil(totalCount / limit);

    return res.status(200).json({
      status: true,
      message: "Payout report generated successfully.",
      data: formattedData,
      totalCount,
      page: parseInt(page),
      totalPages,
    });
  } catch (error) {
    console.error("Error fetching payout report:", error.message);
    return res.status(500).json({
      status: false,
      message: "Failed to generate payout report.",
      error: error.message,
    });
  }
};

const getOnboardingReport = async (req, res) => {
  try {
    const { searchText = "", page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    const whereCondition = {
      role: "Provider",
    };

    if (searchText) {
      whereCondition[Op.or] = [
        { name: { [Op.iLike]: `%${searchText}%` } },
        { phone: { [Op.iLike]: `%${searchText}%` } },
        { email: { [Op.iLike]: `%${searchText}%` } },
      ];
    }

    const { rows: providers, count: totalCount } = await user.findAndCountAll({
      where: whereCondition,
      attributes: ["id", "name", "phone", "email", "isApproved", "createdAt"],
      order: [["createdAt", "DESC"]],
      limit: parseInt(limit),
      offset: parseInt(offset),
    });

    const formattedData = providers.map((provider) => ({
      date: provider.createdAt,
      serviceProvider: provider.name,
      contactPhone: provider.phone,
      phone: provider.phone,
      status: provider.isApproved ? "Approved" : "Pending",
    }));

    return res.status(200).json({
      status: true,
      message: "Onboarding report fetched successfully.",
      data: formattedData,
      totalCount,
      page: parseInt(page),
      totalPages: Math.ceil(totalCount / limit),
    });
  } catch (error) {
    console.error("Error fetching onboarding report:", error.message);
    return res.status(500).json({
      status: false,
      message: "Failed to fetch onboarding report.",
      error: error.message,
    });
  }
};

// System Report
const getPerformanceReports = async (req, res) => {
  try {
    let { startDate, endDate, page = 1, limit = 10 } = req.query;

    // Convert to numbers
    page = parseInt(page);
    limit = parseInt(limit);
    const offset = (page - 1) * limit;

    const whereClause = {};

    // If date filters are provided
    if (startDate || endDate) {
      whereClause.date = {};
      if (startDate) whereClause.date[Op.gte] = new Date(startDate);
      if (endDate) whereClause.date[Op.lte] = new Date(endDate);
    }

    const { rows, count } = await app_performances.findAndCountAll({
      where: whereClause,
      order: [["date", "DESC"]],
      limit,
      offset,
    });

    const report = rows.map((entry) => ({
      date: entry.date,
      totalRequests: entry.totalRequests,
      successRate: entry.totalRequests
        ? ((entry.successfulRequests / entry.totalRequests) * 100).toFixed(2)
        : "0.00",
      errorsLogged: entry.errorCount,
      averageLoadTime: entry.totalRequests
        ? (entry.totalTime / entry.totalRequests).toFixed(3)
        : "0.000",
    }));

    res.json({
      status: true,
      report,
      pagination: {
        totalRecords: count,
        totalPages: Math.ceil(count / limit),
        currentPage: page,
      },
    });
  } catch (error) {
    console.error("Get Performance Reports Error:", error.message);
    return res.status(500).json({
      status: false,
      message: "Internal server error while fetching performance reports.",
      error: error.message,
    });
  }
};

const getUserDeviceOsReport = async (req, res) => {
  try {
    const results = await user.findAll({
      attributes: [
        "device_type",
        "os",
        [Sequelize.fn("COUNT", Sequelize.col("id")), "totalUsers"],
      ],
      where: { role: "User" },
      group: ["device_type", "os"],
      raw: true,
    });

    const total = results.reduce(
      (sum, item) => sum + parseInt(item.totalUsers),
      0
    );

    const report = results.map((item, index) => ({
      id: index + 1,
      deviceType: item.device_type || "Unknown",
      os: item.os || "Unknown",
      totalUsers: parseInt(item.totalUsers),
      share: total
        ? ((item.totalUsers / total) * 100).toFixed(2) + "%"
        : "0.00%",
    }));

    res.status(200).json({
      status: true,
      message: "User Device & OS Report",
      data: report,
      totalUsers: total,
    });
  } catch (err) {
    res.status(500).json({ status: false, message: err.message });
  }
};

// Support Report
const customerComplaintsReport = async (req, res) => {
  try {
    let { startDate, endDate, page = 1, limit = 10 } = req.query;

    // Convert to integers
    page = parseInt(page);
    limit = parseInt(limit);
    const offset = (page - 1) * limit;

    const whereClause = {};

    // Date filtering
    if (startDate || endDate) {
      whereClause.createdAt = {};
      if (startDate) whereClause.createdAt[Op.gte] = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999); // include the whole day
        whereClause.createdAt[Op.lte] = end;
      }
    }

    // Count total for pagination
    const totalCount = await help_support.count({ where: whereClause });

    const complaints = await help_support.findAll({
      where: whereClause,
      attributes: ["id", "name", "createdAt", "message", "status"],
      order: [["createdAt", "DESC"]],
      limit,
      offset,
    });

    const formatted = complaints.map((c) => ({
      complaintId: c.id,
      customerName: c.name || "N/A",
      date: c.createdAt.toISOString().split("T")[0],
      issue: c.message,
      status: c.status === "RESOLVED" ? "Resolved" : "Pending",
    }));

    res.status(200).json({
      status: true,
      data: formatted,
      pagination: {
        total: totalCount,
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit),
      },
    });
  } catch (error) {
    console.error("Error generating complaints report:", error);
    res.status(500).json({ status: false, message: "Internal server error" });
  }
};


const serviceProviderIssuesReport = async (req, res) => {
  try {
    const complaints = await help_support.findAll({
      where: { providerId: { [Op.ne]: null } },
      include: [
        {
          model: user,
          as: "provider",
          attributes: ["name"],
        },
      ],
      attributes: ["id", "message", "status", "createdAt"],
      order: [["createdAt", "DESC"]],
    });

    const report = complaints.map((c) => ({
      complaintId: c.id,
      serviceProvider: c.provider?.name || "Unknown",
      date: c.createdAt.toISOString().split("T")[0],
      issue: c.message,
      resolutionStatus: c.status === "RESOLVED" ? "Resolved" : "Pending",
    }));

    res.status(200).json({ status: true, data: report });
  } catch (error) {
    console.error("Error generating provider issue report:", error);
    res.status(500).json({ status: false, message: "Internal server error" });
  }
};

// Financial
const getRevenueReport = async (req, res) => {
  try {
    const { startDate, endDate, page = 1, limit = 10 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const where = {
      bookingStatus: "COMPLETED",
      finalAmount: { [Op.ne]: null },
    };

    if (startDate && endDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      where.createdAt = {
        [Op.between]: [start, end],
      };
    }

    const { rows, count } = await booking_service.findAndCountAll({
      where,
      order: [["createdAt", "DESC"]],
      limit: parseInt(limit),
      offset,
      raw: true,
    });

    const adminCommission = parseFloat(process.env.ADMIN_COMMISSION || 0.1); // Fallback to 10%

    const report = rows.map((item) => {
      const total = parseFloat(item.finalAmount || 0);
      const commission = +(total * adminCommission).toFixed(2);
      const payout = +(total - commission).toFixed(2);

      return {
        date: new Date(item.createdAt).toLocaleDateString("en-CA"), // Format: YYYY-MM-DD
        totalEarnings: +total.toFixed(2),
        commission: `${adminCommission * 100}%`,
        serviceProviderPayout: payout,
        netRevenue: commission,
      };
    });

    res.status(200).json({
      status: true,
      data: report,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / limit),
      },
    });
  } catch (err) {
    console.error("Revenue Error:", err.message);
    res.status(500).json({ status: false, message: "Internal Server Error" });
  }
};

const providerTransactionReport = async (req, res) => {
  try {
    const { startDate, endDate, page = 1, limit = 10, searchText = "",usersearchText="" } = req.query;
    const offset = (page - 1) * limit;

    const where = {
      bookingStatus: "COMPLETED",
      finalAmount: { [Op.ne]: null },
    };

    if (startDate && endDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      where.createdAt = {
        [Op.between]: [start, end],
      };
    }

    const providerWhere = searchText
      ? { name: { [Op.iLike]: `%${searchText}%` } }
      : undefined;

    const userWhere = usersearchText
      ? { name: { [Op.iLike]: `%${usersearchText}%` } }
      : undefined;

    const { count, rows: bookings } = await booking_service.findAndCountAll({
      where,
      include: [
        {
          model: user,
          as: "provider",
          attributes: ["name"],
          where: providerWhere,
          required: !!searchText,
        },
        {
          model: user,
          as: "user",
          attributes: ["name"],
          where: userWhere,
          required: !!usersearchText,
        },
      ],
      order: [["createdAt", "DESC"]],
      offset: +offset,
      limit: +limit,
    });

    const report = bookings.map((booking) => ({
      transactionId: booking.id,
      date: booking.createdAt.toISOString().split("T")[0],
      customerName: booking.user?.name || "N/A",
      serviceProvider: booking.provider?.name || "N/A",
      amount: +booking.finalAmount,
    }));

    res.status(200).json({
      status: true,
      data: report,
      pagination: {
        total: count,
        page: +page,
        limit: +limit,
        totalPages: Math.ceil(count / limit),
      },
    });
  } catch (error) {
    console.error("Provider Transaction Report Error:", error.message);
    res.status(500).json({ status: false, message: "Internal Server Error" });
  }
};

const commissionReport = async (req, res) => {
  try {
    let { startDate, endDate, limit = 10, page = 1, searchText = "" } = req.query;

    limit = isNaN(parseInt(limit)) ? 10 : parseInt(limit);
    page = isNaN(parseInt(page)) ? 1 : parseInt(page);
    const offset = (page - 1) * limit;

    const where = {
      bookingStatus: "COMPLETED",
      finalAmount: { [Op.ne]: null },
    };

    if (startDate && endDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      where.createdAt = { [Op.between]: [start, end] };
    }

    const providerWhere = searchText
      ? { name: { [Op.iLike]: `%${searchText}%` } }
      : undefined;

    const { rows: bookings, count } = await booking_service.findAndCountAll({
      where,
      include: [
        {
          model: user,
          as: "provider",
          attributes: ["id", "name"],
          where: providerWhere,
          required: !!searchText,
        },
      ],
      order: [["createdAt", "DESC"]],
      limit,
      offset,
    });

    const reportMap = {};

    bookings.forEach((booking) => {
      if (!booking.provider) return;

      const date = booking.createdAt.toISOString().split("T")[0];
      const key = `${date}-${booking.provider.id}`;

      if (!reportMap[key]) {
        reportMap[key] = {
          date,
          serviceProvider: booking.provider.name,
          totalEarning: 0,
        };
      }

      reportMap[key].totalEarning += Number(booking.finalAmount);
    });

    const adminCommissionRate = !isNaN(process.env.ADMIN_COMMISSION)
      ? parseFloat(process.env.ADMIN_COMMISSION)
      : 0.1;

    const providerCommissionRate = !isNaN(process.env.PROVIDER_COMMISSION)
      ? parseFloat(process.env.PROVIDER_COMMISSION)
      : 0.9;

    const report = Object.values(reportMap)
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .map((item) => ({
        date: item.date,
        serviceProvider: item.serviceProvider,
        totalEarning: item.totalEarning.toFixed(2),
        commission: (item.totalEarning * adminCommissionRate).toFixed(2),
        payout: (item.totalEarning * providerCommissionRate).toFixed(2),
      }));

    res.status(200).json({
      status: true,
      data: report,
      pagination: {
        total: count,
        page,
        limit,
        totalPages: Math.ceil(count / limit),
      },
    });
  } catch (error) {
    console.error("Commission Report Error:", error.message);
    res.status(500).json({ status: false, message: "Internal Server Error" });
  }
};

const texReport = async (req, res) => {
  try {
    let {
      startDate,
      endDate,
      page = 1,
      limit = 10,
      searchText = "",
      usersearchText=""
    } = req.query;

    limit = isNaN(parseInt(limit)) ? 10 : parseInt(limit);
    page = isNaN(parseInt(page)) ? 1 : parseInt(page);

    const offset = (parseInt(page) - 1) * parseInt(limit);

    const where = {
      bookingStatus: "COMPLETED",
      finalAmount: { [Op.ne]: null },
    };

    if (startDate && endDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);

      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);

      where.createdAt = {
        [Op.between]: [start, end],
      };
    }

    const providerWhere = searchText
      ? { name: { [Op.iLike]: `%${searchText}%` } }
      : undefined;

    const userWhere = usersearchText
      ? { name: { [Op.iLike]: `%${usersearchText}%` } }
      : undefined;

    const { count, rows: bookings } = await booking_service.findAndCountAll({
      where,
      include: [
        {
          model: user,
          as: "provider",
          attributes: ["name"],
          where: providerWhere,
          required: !!searchText,
        },
        {
          model: user,
          as: "user",
          attributes: ["name"],
          where: userWhere,
          required: !!usersearchText,
        },
      ],
      order: [["createdAt", "DESC"]],
      offset,
      limit: parseInt(limit),
    });

    const report = bookings.map((booking) => ({
      date: new Date(booking.createdAt).toISOString().split("T")[0],
      transactionId: booking.id,
      customerName: booking.user?.name || "",
      serviceProvider: booking.provider?.name || "",
      serviceAmount: +booking.finalAmount,
    }));

    res.status(200).json({
      status: true,
      data: report,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / limit),
      },
    });
  } catch (error) {
    console.error("Tex Report Error:", error.message);
    res.status(500).json({ status: false, message: "Internal Server Error" });
  }
};

module.exports = {
  getAdminDashboard,
  getAllUser, // User Fetch
  getAllVendor, // Vendor Fetch
  getVendoreDashbord, // Vendore Dashboard
  getUserDetails,
  toggleUserStatus,
  getAllBookingsHistory, // Booking History
  getCustomerActivity, // Customer Activity
  getCustomerFeedbackReport, // Customer Feedback Report

  //Marketing
  getPromoCampaignReport,
  getUserEngagementReport,
  getPushNotificationReport,
  //Service
  getProviderPerformanceReport, // Services -service provider performance report
  getPayoutReport, // Services -service provider payout report
  getOnboardingReport, // Services -service provider onboarding report
  // System Report
  getPerformanceReports,
  getUserDeviceOsReport,
  // Support Report
  customerComplaintsReport,
  serviceProviderIssuesReport,
  // Financial
  getRevenueReport,
  providerTransactionReport,
  commissionReport,
  texReport,
};
