// DEEPAK ----

const db = require("../database/db");
const { user_notification } = db;
const { sendNotificationToUsers } = require("../utils/sendNotificationToUsers");
const {sendPushNotification} = require("../configs/sendPushNotification");

//** sendNotificationToUsers  Test & used */
// const allUsersToNotify = [
//   {
//     user: client ka pura data ,
//     title: "Campaign Created!",
//     message: "Your campaign has been successfully created.",
//     type: "Campaign",
//   },
//   {
//     user: adminUser,
//     title: "Client Campaign Released!",
//     message: `${client.role} created a new campaign: ${campaignDetails.title}`,
//     type: "ALERT",
//   },
//   {
//     user: salesUser,
//     title: "New Sales Opportunity!",
//     message: `Campaign "${campaignDetails.title}" is ready. Follow up now.`,
//     type: "SYSTEM",
//   },
// ];

// await sendNotificationToUsers(allUsersToNotify);

//** END */

const sendNotification = async (req, res) => {
  try {
    const { device_token,title, message, type, serviceId,bookingId } = req.body;
    await sendPushNotification(
      device_token,
      { title, body: message },
      type,
      serviceId, // OPTIONAL SERVICE ID
      bookingId // OPTIONAL BOOKING ID
    );
    res.status(200).json({ message: "Notification sent successfully" });
  } catch (error) {
    return res.status(500).json({
      status: false,
      message: "An error occurred while updating conversion.",
      error: error.message,
    });
  }
};

const getAllNotifications = async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ status: false, message: "Unauthorized" });
    }

    const notifications = await user_notification.findAll({
      where: { userId },
      order: [["createdAt", "DESC"]],
    });

    // Mark all unread notifications as read for this user
    await user_notification.update(
      { read: true },
      {
        where: {
          userId,
          read: false,
        },
      }
    );

    return res.status(200).json({
      status: true,
      message: "Notifications fetched successfully.",
      data: notifications,
    });
  } catch (error) {
    console.error("Error fetching notifications:", error);
    return res.status(500).json({
      status: false,
      message: "An error occurred while fetching notifications.",
      error: error.message,
    });
  }
};

const getAllNotificationCount = async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ status: false, message: "Unauthorized" });
    }

    const unreadCount = await user_notification.count({
      where: {
        userId,
        read: false,
      },
    });

    return res.status(200).json({
      status: true,
      message: "Unread notifications count fetched successfully.",
      count: unreadCount,
    });
  } catch (error) {
    console.error("Error fetching notification count:", error);
    return res.status(500).json({
      status: false,
      message: "An error occurred while fetching notification count.",
      error: error.message,
    });
  }
};

const markNotificationClicked = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    if (!userId || !id) {
      return res.status(400).json({ status: false, message: "Missing parameters" });
    }

    await user_notification.update(
      { clicked: true },
      { where: { id: id, userId } }
    );

    return res.status(200).json({ status: true, message: "Notification marked as clicked" });
  } catch (error) {
    console.error("Error marking notification clicked:", error);
    return res.status(500).json({
      status: false,
      message: "An error occurred while updating notification.",
      error: error.message,
    });
  }
};

const markNotificationConverted = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    if (!userId || !id) {
      return res.status(400).json({ status: false, message: "Missing parameters" });
    }

    await user_notification.update(
      { converted: true },
      { where: { id: id, userId } }
    );

    return res.status(200).json({ status: true, message: "Notification marked as converted" });
  } catch (error) {
    console.error("Error marking notification converted:", error);
    return res.status(500).json({
      status: false,
      message: "An error occurred while updating conversion.",
      error: error.message,
    });
  }
};

module.exports = {
  getAllNotifications,
  getAllNotificationCount,
  markNotificationClicked,
  markNotificationConverted,
  sendNotification
};
