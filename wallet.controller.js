// DEEPAK ----

const db = require("../database/db");
const { wallet, wallet_transaction, user,sequelize ,wallet_payment_request } = db;
const { chargeAdminStripeAccount } = require("../utils/stripePayment");
const { v4: uuidv4 } = require('uuid'); // import at top
const { chargeAdminSkipCashAccount  ,verifySkipCashPaymentStatus} = require("../utils/skipCasePayment");

const addToWallet = async (req, res) => {
  const t = await sequelize.transaction(); // Start transaction
  try {
    const userId = req.user.id;
    const { amount, description ,payment_method ,token} = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ status: false, message: "Invalid amount" });
    }

    // 1. Charge the admin Stripe account 
    // const payment = await chargeAdminStripeAccount(amount);

    //   // Front Base 
    // const payment = await chargeAdminStripeAccount(amount, payment_method);

    // // FrontEnd Base with Token
    const payment = await chargeAdminStripeAccount(amount, token);

    if (!payment.status) {
      return res.status(402).json({
        status: false,
        message: "Stripe charge failed",
        error: payment.error,
      });
    }

    // 2. Find or create wallet within transaction
    let userWallet = await wallet.findOne({ where: { userId }, transaction: t });
    if (!userWallet) {
      userWallet = await wallet.create({ userId, balance: 0.0 }, { transaction: t });
    }

    // 3. Update wallet balance
    userWallet.balance = parseFloat(userWallet.balance) + parseFloat(amount);
    await userWallet.save({ transaction: t });

    // 4. Log wallet transaction
    await wallet_transaction.create({
      userId,
      amount,
      type: "CREDIT",
      description: description || "Wallet recharge via Stripe",
    }, { transaction: t });

    await t.commit(); // Everything succeeded, commit transaction

    return res.status(200).json({
      status: true,
      message: "Wallet recharged successfully",
      balance: userWallet.balance,
      paymentIntentId: payment.id,
    });
  } catch (error) {
    await t.rollback(); // Rollback on any failure
    console.error("Add to wallet failed:", error);
    return res.status(500).json({
      status: false,
      message: "Wallet recharge failed",
      error: error.message,
    });
  }
};

const getWalletByUserId = async (req, res) => {
  try {
    const userId = req.user.id;
    const foundWallet = await wallet.findOne({
      where: { userId },
      include: [
        {
          model: user,
          as: "user",
          attributes: ["id", "email", "role"],
        },
      ],
    });

    if (!foundWallet)
      return res
        .status(404)
        .json({ status: false, message: "Wallet not found" });

    res.status(200).json({ status: true, wallet: foundWallet });
  } catch (error) {
    res.status(500).json({ status: false, error: error.message });
  }
};

const latestWalletTransactions = async (req, res) => {
  try {
    const userId = req.user.id;

    const transactions = await wallet_transaction.findAll({
      where: { userId },
      include: [
        {
          model: user,
          as: "user",
          attributes: ["id", "name", "email"],
        },
      ],
      order: [["createdAt", "DESC"]], // Latest first
    });

    return res.status(200).json({
      status: true,
      message: "Latest wallet transactions fetched successfully",
      transactions,
    });
  } catch (error) {
    console.error("Error fetching wallet transactions:", error);
    return res.status(500).json({ status: false, error: error.message });
  }
};

//** ADMIN */
const transactionSummary = async (req, res) => {
  try {
    const {userId} = req.params;

    const transactions = await wallet_transaction.findAll({
      where: { userId },
      include: [
        {
          model: user,
          as: "user",
          attributes: ["id", "name", "email"],
        },
      ],
      order: [["createdAt", "DESC"]], // Latest first
    });

    return res.status(200).json({
      status: true,
      message: "Transactions summary fetched successfully",
      transactions,
    });
  } catch (error) {
    console.error("Error fetching wallet transactions:", error);
    return res.status(500).json({ status: false, error: error.message });
  }
};

//** Wallet */

module.exports = {
  addToWallet,
  getWalletByUserId,
  latestWalletTransactions,
  //** ADMIN */
  transactionSummary,

  //** Wallet Transaction */
};
