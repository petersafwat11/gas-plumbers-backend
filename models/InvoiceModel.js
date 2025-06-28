const mongoose = require("mongoose");

const invoiceSchema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.ObjectId,
      ref: "User",
      required: [true, "Customer ID is required"],
    },

    amount: {
      type: Number,
      required: [true, "Amount is required"],
      min: [0, "Amount cannot be negative"],
    },

    status: {
      type: String,
      enum: {
        values: [
          "pending",
          "paid",
          "overdue",
          "cancelled",
          "refunded",
          "processing",
        ],
        message:
          "Status must be: pending, paid, overdue, cancelled, refunded, or processing",
      },
      default: "pending",
    },

    timestamp: {
      type: Date,
      default: Date.now,
    },

    method: {
      type: String,
      enum: {
        values: ["credit_card", "debit_card"],
        message: "Payment method must be: credit_card or debit_card",
      },
    },

    // Additional useful fields
    invoiceNumber: {
      type: String,
      unique: true,
      required: [true, "Invoice number is required"],
    },

    jobId: {
      type: mongoose.Schema.ObjectId,
      ref: "Job",
      required: [true, "Job ID is required"],
    },

    engineerId: {
      type: mongoose.Schema.ObjectId,
      ref: "User",
    },

    paidDate: {
      type: Date,
    },

    // Stripe-specific fields
    stripePaymentIntentId: {
      type: String,
      unique: true,
      sparse: true, // Allows multiple null values
    },

    stripeCustomerId: {
      type: String,
    },

    stripeInvoiceId: {
      type: String,
      unique: true,
      sparse: true,
    },

    currency: {
      type: String,
      default: "usd",
      enum: ["usd", "cad", "eur", "gbp"],
    },

    // Payment metadata
    paymentMetadata: {
      last4: String, // Last 4 digits of card
      brand: String, // visa, mastercard, etc.
      country: String,
      funding: String, // credit, debit, prepaid
    },

    // System fields
    createdAt: {
      type: Date,
      default: Date.now,
    },

    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes for better query performance
invoiceSchema.index({ customerId: 1 });
invoiceSchema.index({ jobId: 1 });
invoiceSchema.index({ status: 1 });
invoiceSchema.index({ invoiceNumber: 1 }, { unique: true });
invoiceSchema.index({ stripePaymentIntentId: 1 });
invoiceSchema.index({ stripeCustomerId: 1 });

// Virtual for total amount calculation
invoiceSchema.virtual("totalAmount").get(function () {
  return this.amount;
});

// Virtual for amount in cents (Stripe uses cents)
invoiceSchema.virtual("amountInCents").get(function () {
  return Math.round(this.amount * 100);
});

// Pre-save middleware to update timestamp and status
invoiceSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  // Set paid date when status changes to paid
  if (this.status === "paid" && !this.paidDate) {
    this.paidDate = new Date();
  }

  next();
});

// Static method to generate invoice number
invoiceSchema.statics.generateInvoiceNumber = async function () {
  const year = new Date().getFullYear();
  const count = await this.countDocuments({
    createdAt: {
      $gte: new Date(year, 0, 1),
      $lt: new Date(year + 1, 0, 1),
    },
  });

  return `INV-${year}-${String(count + 1).padStart(4, "0")}`;
};

// Instance method to mark as paid with Stripe data
invoiceSchema.methods.markAsPaid = function (paymentMethod, stripeData = {}) {
  this.status = "paid";
  this.paidDate = new Date();
  this.method = paymentMethod;

  // Store Stripe-specific data
  if (stripeData.paymentIntentId) {
    this.stripePaymentIntentId = stripeData.paymentIntentId;
  }
  if (stripeData.customerId) {
    this.stripeCustomerId = stripeData.customerId;
  }
  if (stripeData.paymentMethod) {
    this.paymentMetadata = {
      last4: stripeData.paymentMethod.card?.last4,
      brand: stripeData.paymentMethod.card?.brand,
      country: stripeData.paymentMethod.card?.country,
      funding: stripeData.paymentMethod.card?.funding,
    };
  }

  return this.save();
};

// Instance method to mark as processing (for Stripe pending payments)
invoiceSchema.methods.markAsProcessing = function (stripePaymentIntentId) {
  this.status = "processing";
  this.stripePaymentIntentId = stripePaymentIntentId;
  return this.save();
};

// Instance method to handle failed payments
invoiceSchema.methods.markAsFailed = function () {
  this.status = "pending";
  return this.save();
};

// Static method to find by Stripe Payment Intent ID
invoiceSchema.statics.findByStripePaymentIntent = function (paymentIntentId) {
  return this.findOne({ stripePaymentIntentId: paymentIntentId });
};

const Invoice = mongoose.model("Invoice", invoiceSchema);

module.exports = Invoice;
