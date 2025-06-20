// DEEPAK ----

const BASE_URL = `/public/images/`; // Define globally if used in both functions
const db = require("../database/db");
const { promo_offer, user,promo_redemption } = db;

//** Admin Access */
const addOffer = async (req, res) => {
  try {

    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        status: false,
        message: "User is not authenticated.",
      });
    }

    const users = await user.findByPk(userId);
    if (!users || users.role !== "Admin") {
      return res.status(403).json({
        status: false,
        message: "Access denied. Only Admins can perform this action.",
      });
    }

    const { offerCode, discountType, discountValue, expiresAt } = req.body;

    if (!offerCode || !discountType || !discountValue) {
      return res.status(400).json({
        status: false,
        message: "offerCode, discountType, and discountValue are required",
      });
    }

    const existingOffer = await promo_offer.findOne({ where: { offerCode } });
    if (existingOffer) {
      return res.status(409).json({
        status: false,
        message: "Offer code already exists",
      });
    }

    const offerImage = req.file ? `${BASE_URL}${req.file.filename}` : null;

    const newOffer = await promo_offer.create({
      offerCode,
      discountType,
      discountValue,
      expiresAt,
      offerImage,
    });

    return res.status(201).json({
      status: true,
      message: "Offer created successfully",
      data: newOffer,
    });
  } catch (error) {
    console.error("Add Offer Error:", error.message);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

const updateOffer = async (req, res) => {
  try {

    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        status: false,
        message: "User is not authenticated.",
      });
    }

    const users = await user.findByPk(userId);
    if (!users || users.role !== "Admin") {
      return res.status(403).json({
        status: false,
        message: "Access denied. Only Admins can perform this action.",
      });
    }

    const { offerId } = req.params;
    const { offerCode, discountType, discountValue, expiresAt } = req.body;

    const offer = await promo_offer.findByPk(offerId);
    if (!offer) {
      return res.status(404).json({
        status: false,
        message: "Offer not found",
      });
    }

    const updateData = {
      offerCode,
      discountType,
      discountValue,
      expiresAt,
    };

    if (req.file) {
      updateData.offerImage = `${BASE_URL}${req.file.filename}`;
    }

    await offer.update(updateData);

    return res.status(200).json({
      status: true,
      message: "Offer updated successfully",
      data: offer,
    });
  } catch (error) {
    console.error("Update Offer Error:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};


const deleteOffer = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        status: false,
        message: "User is not authenticated.",
      });
    }

    const users = await user.findByPk(userId);
    if (!users || users.role !== "Admin") {
      return res.status(403).json({
        status: false,
        message: "Access denied. Only Admins can perform this action.",
      });
    }

    const { offerId } = req.params;
    const offer = await promo_offer.findByPk(offerId);

    if (!offer) {
      return res
        .status(404)
        .json({ status: false, message: "Offer not found" });
    }

    await offer.destroy();

    return res
      .status(200)
      .json({ status: true, message: "Offer deleted successfully" });
  } catch (error) {
    res.status(500).json({
      status: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

//** User Access */
const getAllOffers = async (req, res) => {
  try {
    const offers = await promo_offer.findAll();
    return res.status(200).json({ status: true, data: offers });
  } catch (error) {
    res.status(500).json({
      status: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

const getOfferById = async (req, res) => {
  try {
    const { offerId } = req.params;
    const offer = await promo_offer.findByPk(offerId);

    if (!offer) {
      return res
        .status(404)
        .json({ status: false, message: "Offer not found" });
    }

    return res.status(200).json({ status: true, data: offer });
  } catch (error) {
    res.status(500).json({
      status: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Check Coupon Code
const checkCouponCode = async (req, res) => {
  try {
    const { offerCode } = req.query;

    if (!offerCode) {
      return res.status(400).json({
        status: false,
        message: "Offer code is required.",
      });
    }

    const coupon = await promo_offer.findOne({ where: { offerCode } });

    if (!coupon) {
      return res.status(404).json({
        status: false,
        message: "Invalid coupon code.",
      });
    }

    // Check if the coupon has expired
    if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) {
      return res.status(400).json({
        status: false,
        message: "Coupon code has expired.",
      });
    }

    return res.status(200).json({
      status: true,
      message: "Coupon code is valid.",
      data: coupon,
    });
  } catch (error) {
    console.error("Check Coupon Error:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

const redeemPromoCode = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { offerCode, originalAmount } = req.body;

    if (!userId || !offerCode || !originalAmount) {
      return res.status(400).json({
        status: false,
        message: "userId, offerCode, and originalAmount are required.",
      });
    }

    const offer = await promo_offer.findOne({ where: { offerCode } });

    if (!offer) {
      return res.status(404).json({ status: false, message: "Invalid promo code." });
    }

    // Check expiration
    if (offer.expiresAt && new Date(offer.expiresAt) < new Date()) {
      return res.status(400).json({ status: false, message: "Promo code has expired." });
    }

    // Calculate discount
    let discountAmount = 0;
    if (offer.discountType === "PERCENTAGE") {
      discountAmount = (originalAmount * offer.discountValue) / 100;
    } else {
      discountAmount = offer.discountValue;
    }

    // Save redemption log
    await promo_redemption.create({
      userId,
      promoOfferId: offer.id,
      discountAmount,
    });

    return res.status(200).json({
      status: true,
      message: "Promo code redeemed successfully.",
      discountAmount,
      finalAmount: originalAmount - discountAmount,
    });
  } catch (error) {
    console.error("Redeem Promo Code Error:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

module.exports = {
  addOffer,
  updateOffer,
  deleteOffer,
  getAllOffers,
  getOfferById,
  checkCouponCode,
  redeemPromoCode
};
