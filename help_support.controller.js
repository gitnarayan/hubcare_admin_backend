const db = require("../database/db");
const HelpSupport = db.help_support;

const createHelpSupport = async (req, res) => {
  try {
    const { name, email, phone, message } = req.body;

    if (!name || !email || !phone || !message) {
      return res.status(400).json({
        status: false,
        message: "name, email, phone, and message are required.",
      });
    }

    const ticket = await HelpSupport.create({
      name,
      email,
      phone,
      message,
    });

    return res.status(200).json({
      status: true,
      message: "Support request submitted successfully.",
      data: ticket,
    });
  } catch (err) {
    return res.status(500).json({
      status: false,
      message: "Server error",
      error: err.message,
    });
  }
};


//** Admin */
// Admin All Ticket
const getAllTickets = async (req, res) => {
  try {
    const tickets = await HelpSupport.findAll({
      order: [["createdAt", "DESC"]],
    });
    res.status(200).json({ status: true, data: tickets });
  } catch (err) {
    res
      .status(500)
      .json({ status: false, message: "Server error", error: err.message });
  }
};

const updateTicketStatus = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { status } = req.body; // "OPEN", "RESOLVED", "CLOSED"

    const ticket = await HelpSupport.findByPk(ticketId);
    if (!ticket) {
      return res
        .status(404)
        .json({ status: false, message: "Ticket not found" });
    }

    ticket.status = status;
    await ticket.save();

    res
      .status(200)
      .json({ status: true, message: "Status updated", data: ticket });
  } catch (err) {
    res
      .status(500)
      .json({ status: false, message: "Server error", error: err.message });
  }
};

const deleteTicket = async (req, res) => {
  try {
    const { ticketId } = req.params;

    const ticket = await HelpSupport.findByPk(ticketId);
    if (!ticket) {
      return res
        .status(404)
        .json({ status: false, message: "Ticket not found" });
    }

    await ticket.destroy();
    res.status(200).json({ status: true, message: "Ticket deleted" });
  } catch (err) {
    res
      .status(500)
      .json({ status: false, message: "Server error", error: err.message });
  }
};

module.exports = {
  createHelpSupport,
  getAllTickets,
  updateTicketStatus,
  deleteTicket,
};
