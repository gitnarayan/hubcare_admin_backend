const { Op } = require("sequelize");
const db = require("../../database/db");
const { getSocketInstance, getConnectedUsers } = require("../../utils/socket");

const sendMessage1 = async (req, res) => {
  const { content, messageType = "text", attachments, receiverId } = req.body;
  const senderId = req.user.id; // Get senderId from the token
  // console.log("Sender ID:", senderId, "Receiver ID:", receiverId);

  try {
    // Validate receiverId (make sure it exists)
    if (!receiverId) {
      return res.status(400).json({status:false, message: "Receiver ID is required" });
    }

    // Create the new message in the database
    const message = await db.message.create({
      senderId,
      receiverId, // Direct message should have a receiver
      content,
      messageType,
      attachments,
    });

    // Get Socket.io instance
    const io = getSocketInstance();
    const connectedUsers = getConnectedUsers(); // Get connected users

    // Check if the receiver is connected and emit the message
    if (connectedUsers[receiverId]) {
      io.to(connectedUsers[receiverId]).emit("newMessage", message);
    } else {
      console.log(`Receiver ${receiverId} is not online.`);
    }

    return res
      .status(201)
      .json({status: true, message: "Message sent successfully", data: message });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({status: false, message: "Failed to send message", error: error.message });
  }
};

const getMessages1 = async (req, res) => {
  const { receiverId } = req.params; // Get the receiverId from the request params
  const senderId = req.user.id; // Get senderId from the token (which could be the provider)

  console.log("Receiver ID:", receiverId, "Sender ID:", senderId);

  try {
    // Validate receiverId (make sure it exists)
    if (!receiverId) {
      return res.status(400).json({status: false, message: "Receiver ID is required" });
    }

    // Fetch messages where the sender is either the provider or the user and receiver is the other
    const messages = await db.message.findAll({
      where: {
        [Op.or]: [
          { senderId, receiverId }, // Provider sends message to user
          { senderId: receiverId, receiverId: senderId }, // User sends message to provider
        ],
      },
      order: [["createdAt", "ASC"]], // Order messages by creation date (ascending)
    });

    if (!messages.length) {
      return res
        .status(404)
        .json({
          message: "No messages found between the sender and receiver.",
        });
    }

    return res.status(200).json({status: true, messages });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({status:true, message: "Failed to fetch messages", error: error.message });
  }
};

const markMessageAsRead = async (req, res) => {
  const { messageId } = req.params;

  try {
    const message = await db.message.findOne({ id: messageId });
    if (!message) {
      return res.status(404).json({ message: "Message not found" });
    }

    message.isRead = true;
    await message.save();

    return res
      .status(200)
      .json({ message: "Message marked as read", data: message });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({
        message: "Failed to mark message as read",
        error: error.message,
      });
  }
};

const sendMessage = async (req, res) => {
  const { bookingId } = req.params;
  const { content, messageType = "text", attachments } = req.body;
  const senderId = req.user.id;
  const senderRole = req.user.role;

  if (!bookingId) {
    return res.status(400).json({ status: false, message: "Booking ID is required" });
  }

  try {
    const booking = await db.booking_service.findByPk(bookingId);
    if (!booking) {
      return res.status(404).json({ status: false, message: "Booking not found" });
    }

    const adminUser = await db.user.findOne({ where: { role: "Admin" } });
    if (!adminUser) {
      return res.status(500).json({ status: false, message: "Admin not found" });
    }

    let receiverId;

    if (senderRole === "Admin") {
      receiverId = booking.userId;
    } else if (senderId === booking.userId) {
      receiverId = adminUser.id;
    } else {
      return res.status(403).json({ status: false, message: "Unauthorized sender for this booking" });
    }

    const message = await db.message.create({
      senderId,
      receiverId,
      bookingId,
      content,
      messageType,
      attachments,
    });

    const io = getSocketInstance();
    const connectedUsers = getConnectedUsers();

    if (connectedUsers[receiverId]) {
      io.to(connectedUsers[receiverId]).emit("newMessage", message);
    }

    return res.status(201).json({ status: true, message: "Message sent", data: message });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, message: "Failed to send message", error: error.message });
  }
};

const getMessages = async (req, res) => {
  const { bookingId } = req.params;
  const userId = req.user.id;

  try {
    const booking = await db.booking_service.findByPk(bookingId);
    if (!booking) {
      return res.status(404).json({ status: false, message: "Booking not found" });
    }

    const adminUser = await db.user.findOne({ where: { role: "Admin" } });

    const allowedUsers = [booking.userId, adminUser?.id];
    if (!allowedUsers.includes(userId)) {
      return res.status(403).json({
        status: false,
        message: "You are not allowed to view messages for this booking",
      });
    }

    const messages = await db.message.findAll({
      where: { bookingId },
      order: [["createdAt", "ASC"]],
    });

    // Mark messages as read (only where current user is the receiver)
    await db.message.update(
      { isRead: true },
      {
        where: {
          bookingId,
          receiverId: userId,
          isRead: false,
        },
      }
    );

    return res.status(200).json({ status: true, messages });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      status: false,
      message: "Failed to fetch messages",
      error: error.message,
    });
  }
};

module.exports = { sendMessage, getMessages, markMessageAsRead };
