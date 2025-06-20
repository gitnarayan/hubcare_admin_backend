// DEEPAK ----

const db = require("../database/db");
const { review_ratings, user } = db; // Assuming "user" is the User model

const submitReview = async (req, res) => {
  try {
    const userRole = req.user?.role;
    const userId = req.user?.id;

    if (userRole !== "User") {
      return res.status(403).json({
        status: false,
        message: "Access denied. Only users can submit reviews.",
      });
    }

    const { providerId } = req.params;
    let { rating, review } = req.body;

    if (!providerId) {
      return res.status(400).json({
        status: false,
        message: "providerId is required.",
      });
    }

    if (!rating || !review) {
      return res.status(400).json({
        status: false,
        message: "review and rating are required.",
      });
    }

    // Optional: Check if provider exists
    const provider = await user.findOne({ where: { id: providerId } });
    if (!provider) {
      return res.status(404).json({
        status: false,
        message: "Provider not found.",
      });
    }

    rating = parseInt(rating, 10);

    // Rating validation: Check if rating is between 1 and 5
    if (rating < 1 || rating > 5) {
      return res.status(400).json({
        status: false,
        message: "Rating must be between 1 and 5.",
      });
    }

    // Optional: Prevent duplicate reviews (per user-provider pair)
    const existingReview = await review_ratings.findOne({
      where: { userId, providerId },
    });

    if (existingReview) {
      return res.status(400).json({
        status: false,
        message: "You have already submitted a review for this provider.",
      });
    }

    const newReview = await review_ratings.create({
      userId,
      providerId,
      rating,
      review,
    });

    return res.status(201).json({
      status: true,
      message: "Review submitted successfully.",
      data: newReview,
    });
  } catch (error) {
    console.error("Submit Review Error:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error while submitting review.",
      error: error.message,
    });
  }
};

const getReviewsByService = async (req, res) => {
  try {
    const { providerId } = req.params;

    if (!providerId) {
      return res.status(400).json({
        status: false,
        message: "providerId is required in params.",
      });
    }

    // Fetch the reviews for the provider
    const reviewsList = await review_ratings.findAll({
      where: { providerId },
      include: [
        {
          model: user,
          as: "users",
          attributes: ["id", "name", "email"], // Include user data (optional)
        },
      ],
      order: [["createdAt", "DESC"]],
    });

    // If no reviews exist, return a default response
    if (reviewsList.length === 0) {
      return res.status(200).json({
        status: true,
        message: "No reviews available for this provider.",
        data: {
          averageRating: 0,
          totalReviews: 0,
          reviews: [],
        },
      });
    }

    // Calculate the average rating
    const totalRatings = reviewsList.reduce(
      (sum, review) => sum + review.rating,
      0
    );
    const averageRating = totalRatings / reviewsList.length;

    // Get the total number of reviews
    const totalReviews = reviewsList.length;

    // Respond with the reviews and the calculated data
    return res.status(200).json({
      status: true,
      message: "Reviews fetched successfully.",
      data: {
        averageRating: averageRating.toFixed(1),
        totalReviews,
        reviews: reviewsList,
      },
    });
  } catch (error) {
    console.error("Get Reviews Error:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error while fetching reviews.",
      error: error.message,
    });
  }
};

module.exports = {
  submitReview,
  getReviewsByService,
};
