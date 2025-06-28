const mongoose = require("mongoose");

const emergencyRequestSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Please provide a title for the emergency request"],
      trim: true,
      maxlength: [100, "Title cannot be more than 100 characters"],
    },
    description: {
      type: String,
      required: [true, "Please provide a description of the emergency"],
      trim: true,
      maxlength: [1000, "Description cannot be more than 1000 characters"],
    },
    images: {
      type: [String],
      default: [],
      validate: {
        validator: function (v) {
          // Allow empty array or validate each image URL/path
          return v.every((image) =>
            /^(https?:\/\/)|(\/uploads\/)|(data:image\/)/.test(image)
          );
        },
        message: "Please provide valid image URLs, paths, or base64 data",
      },
      maxlength: [10, "Cannot upload more than 10 images"],
    },
    skillsNeeded: {
      type: [String],
      required: [true, "Please specify the skills needed for this emergency"],
      validate: {
        validator: function (v) {
          return v && v.length > 0;
        },
        message: "At least one skill must be specified",
      },
    },
    // Reference to the customer who made the request
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Emergency request must belong to a customer"],
    },
    // Reference to the engineer assigned (if any)
    engineerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    status: {
      type: String,
      enum: ["pending", "assigned", "in-progress", "completed", "cancelled"],
      default: "pending",
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high", "critical"],
      default: "medium",
    },
    estimatedCost: {
      type: Number,
      min: 0,
    },
    firstHourCost: {
      type: Number,
      min: 0,
    },
    scheduledDate: {
      type: Date,
    },
    preferredTime: {
      date: {
        type: Date,
        required: [true, "Please provide a preferred date"],
      },
      startTime: {
        type: String,
        required: [true, "Please provide a preferred start time"],
        validate: {
          validator: function (v) {
            return /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v);
          },
          message: "Start time must be in HH:MM format",
        },
      },
      endTime: {
        type: String,
        required: [true, "Please provide a preferred end time"],
        validate: {
          validator: function (v) {
            return /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v);
          },
          message: "End time must be in HH:MM format",
        },
      },
    },
    completedDate: {
      type: Date,
    },
    notes: {
      type: String,
      maxlength: [500, "Notes cannot be more than 500 characters"],
    },
    // Internal notes for engineers/admin
    internalNotes: {
      type: String,
      maxlength: [500, "Internal notes cannot be more than 500 characters"],
    },
  },
  {
    timestamps: true, // This adds createdAt and updatedAt automatically
  }
);

// Indexes for better query performance
emergencyRequestSchema.index({ customerId: 1 });
emergencyRequestSchema.index({ engineerId: 1 });
emergencyRequestSchema.index({ status: 1 });
emergencyRequestSchema.index({ priority: 1 });
emergencyRequestSchema.index({ createdAt: -1 });
emergencyRequestSchema.index({ skillsNeeded: 1 });

// Virtual for getting the age of the request
emergencyRequestSchema.virtual("requestAge").get(function () {
  return Date.now() - this.createdAt;
});

// Virtual for getting human-readable request age
emergencyRequestSchema.virtual("requestAgeFormatted").get(function () {
  const ageMs = Date.now() - this.createdAt;
  const ageHours = Math.floor(ageMs / (1000 * 60 * 60));
  const ageDays = Math.floor(ageHours / 24);

  if (ageDays > 0) {
    return `${ageDays} day${ageDays > 1 ? "s" : ""} ago`;
  } else if (ageHours > 0) {
    return `${ageHours} hour${ageHours > 1 ? "s" : ""} ago`;
  } else {
    const ageMinutes = Math.floor(ageMs / (1000 * 60));
    return `${ageMinutes} minute${ageMinutes > 1 ? "s" : ""} ago`;
  }
});

// Static method to find requests by customer
emergencyRequestSchema.statics.findByCustomer = function (customerId) {
  return this.find({ customerId })
    .populate("engineerId", "username email phoneNumber")
    .sort({ createdAt: -1 });
};

// Static method to find requests by engineer
emergencyRequestSchema.statics.findByEngineer = function (engineerId) {
  return this.find({ engineerId })
    .populate(
      "customerId",
      "username email phoneNumber address city state zipCode"
    )
    .sort({ createdAt: -1 });
};

// Static method to get dashboard stats
emergencyRequestSchema.statics.getDashboardStats = function () {
  return this.aggregate([
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
      },
    },
    {
      $group: {
        _id: null,
        total: { $sum: "$count" },
        statusCounts: {
          $push: {
            status: "$_id",
            count: "$count",
          },
        },
      },
    },
  ]);
};

// Instance method to assign engineer
emergencyRequestSchema.methods.assignEngineer = function (engineerId) {
  this.engineerId = engineerId;
  this.status = "assigned";
  return this.save();
};

// Instance method to start work
emergencyRequestSchema.methods.startWork = function () {
  this.status = "in-progress";
  return this.save();
};

// Instance method to mark as completed
emergencyRequestSchema.methods.markCompleted = function (actualCost, notes) {
  this.status = "completed";
  this.completedDate = new Date();
  if (actualCost) this.actualCost = actualCost;
  if (notes) this.notes = notes;
  return this.save();
};

// Instance method to cancel request
emergencyRequestSchema.methods.cancelRequest = function (reason) {
  this.status = "cancelled";
  if (reason) this.internalNotes = reason;
  return this.save();
};

// Instance method to get customer info (populate if needed)
emergencyRequestSchema.methods.getCustomerInfo = async function () {
  if (this.populated("customerId")) {
    return this.customerId;
  }
  await this.populate(
    "customerId",
    "username email phoneNumber address city state zipCode"
  );
  return this.customerId;
};

// Instance method to get engineer info (populate if needed)
emergencyRequestSchema.methods.getEngineerInfo = async function () {
  if (!this.engineerId) return null;
  if (this.populated("engineerId")) {
    return this.engineerId;
  }
  await this.populate("engineerId", "username email phoneNumber");
  return this.engineerId;
};

const EmergencyRequest = mongoose.model(
  "EmergencyRequest",
  emergencyRequestSchema
);

module.exports = EmergencyRequest;
